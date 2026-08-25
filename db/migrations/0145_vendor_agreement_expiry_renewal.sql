-- KONTA MOY — enforce time-bounded vendor agreements and renewal handoff.
-- Signed agreements remain immutable evidence. Expiry changes lifecycle state;
-- a verified successor may take over automatically when its effective date arrives.

CREATE INDEX IF NOT EXISTS vendor_commercial_agreements_effective_window_idx
  ON public.vendor_commercial_agreements(vendor_id, status, starts_at, ends_at);

CREATE OR REPLACE FUNCTION bls_private.guard_verified_agreement_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.signed_pdf_object_key IS NULL
       OR NEW.signed_pdf_sha256 IS NULL
       OR NEW.signed_document_received_at IS NULL
       OR NEW.govgr_reference IS NULL
       OR btrim(NEW.govgr_reference) = ''
       OR NEW.govgr_verified_at IS NULL
       OR NEW.govgr_verified_by IS NULL THEN
      RAISE EXCEPTION 'Agreement activation requires stored signed PDF and verified gov.gr reference';
    END IF;

    IF NEW.starts_at > now()
       OR (NEW.ends_at IS NOT NULL AND NEW.ends_at <= now()) THEN
      RAISE EXCEPTION 'Agreement activation requires a currently effective contract window';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.guard_vendor_public_visibility_has_effective_agreement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_research_listing boolean;
BEGIN
  IF NOT NEW.public_directory_visible THEN
    RETURN NEW;
  END IF;

  -- Re-check only when visibility is being enabled or the vendor is becoming active.
  IF TG_OP = 'UPDATE'
     AND OLD.public_directory_visible = true
     AND NOT (NEW.status::text = 'active' AND OLD.status::text IS DISTINCT FROM 'active') THEN
    RETURN NEW;
  END IF;

  v_research_listing := NEW.public_id LIKE 'vendor_research_%' AND NEW.status::text = 'invited';
  IF v_research_listing THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text <> 'active' THEN
    RAISE EXCEPTION 'Only active vendors or invited research listings may be publicly visible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_commercial_agreements a
    WHERE a.vendor_id = NEW.id
      AND a.status = 'active'
      AND a.signed_pdf_object_key IS NOT NULL
      AND a.signed_pdf_sha256 IS NOT NULL
      AND a.signed_document_received_at IS NOT NULL
      AND a.govgr_reference IS NOT NULL
      AND btrim(a.govgr_reference) <> ''
      AND a.govgr_verified_at IS NOT NULL
      AND a.govgr_verified_by IS NOT NULL
      AND a.starts_at <= now()
      AND (a.ends_at IS NULL OR a.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'Public vendor visibility requires a currently effective verified agreement';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_businesses_require_effective_agreement_for_visibility
  ON public.vendor_businesses;
CREATE TRIGGER vendor_businesses_require_effective_agreement_for_visibility
BEFORE INSERT OR UPDATE OF public_directory_visible, status
ON public.vendor_businesses
FOR EACH ROW
EXECUTE FUNCTION bls_private.guard_vendor_public_visibility_has_effective_agreement();

CREATE OR REPLACE FUNCTION bls_private.reconcile_vendor_agreement_lifecycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_now timestamptz := now();
  v_expired_count integer := 0;
  v_successor_count integer := 0;
  v_restricted_count integer := 0;
  v_row record;
BEGIN
  -- 1. Time-expire agreements whose signed term has ended.
  FOR v_row IN
    UPDATE public.vendor_commercial_agreements a
       SET status = 'expired', updated_at = v_now
     WHERE a.status = 'active'
       AND a.ends_at IS NOT NULL
       AND a.ends_at <= v_now
    RETURNING a.id, a.vendor_id, a.ends_at, a.agreement_code, a.agreement_version
  LOOP
    v_expired_count := v_expired_count + 1;
    INSERT INTO public.vendor_agreement_audit_log(
      agreement_id, vendor_id, action, from_status, to_status, actor_user_id, metadata, created_at
    ) VALUES (
      v_row.id, v_row.vendor_id, 'agreement_auto_expired', 'active', 'expired', NULL,
      jsonb_build_object(
        'agreementCode', v_row.agreement_code,
        'agreementVersion', v_row.agreement_version,
        'effectiveEnd', v_row.ends_at,
        'reconciledAt', v_now
      ), v_now
    );
  END LOOP;

  -- 2. A fully verified successor can take over automatically at its start time.
  -- This allows an admin to complete renewal paperwork before the old term ends
  -- without prematurely superseding the still-effective predecessor.
  FOR v_row IN
    SELECT a.id, a.vendor_id, a.supersedes_agreement_id, a.agreement_code, a.agreement_version, a.status AS prior_status
    FROM public.vendor_commercial_agreements a
    JOIN public.vendor_commercial_agreements predecessor ON predecessor.id = a.supersedes_agreement_id
    WHERE a.status IN ('govgr_verified', 'eligible_for_activation')
      AND a.starts_at <= v_now
      AND (a.ends_at IS NULL OR a.ends_at > v_now)
      AND a.signed_pdf_object_key IS NOT NULL
      AND a.signed_pdf_sha256 IS NOT NULL
      AND a.signed_document_received_at IS NOT NULL
      AND a.govgr_reference IS NOT NULL
      AND btrim(a.govgr_reference) <> ''
      AND a.govgr_verified_at IS NOT NULL
      AND a.govgr_verified_by IS NOT NULL
      AND predecessor.vendor_id = a.vendor_id
      AND predecessor.status IN ('expired', 'superseded', 'terminated')
    ORDER BY a.starts_at, a.created_at
    FOR UPDATE OF a
  LOOP
    -- Do not create two simultaneous active agreements for the same vendor.
    IF EXISTS (
      SELECT 1 FROM public.vendor_commercial_agreements current_agreement
      WHERE current_agreement.vendor_id = v_row.vendor_id
        AND current_agreement.status = 'active'
        AND current_agreement.starts_at <= v_now
        AND (current_agreement.ends_at IS NULL OR current_agreement.ends_at > v_now)
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.vendor_commercial_agreements
       SET status = 'active',
           activated_at = COALESCE(activated_at, v_now),
           updated_at = v_now
     WHERE id = v_row.id;

    -- Contract expiry uses restricted. A manually suspended vendor stays suspended
    -- and therefore cannot be silently unsuspended by a renewal cron.
    UPDATE public.vendor_businesses
       SET status = CASE WHEN status::text = 'restricted' THEN 'active'::vendor_status ELSE status END,
           contract_started_at = COALESCE(contract_started_at, v_now),
           contract_ended_at = NULL,
           public_directory_visible = CASE
             WHEN status::text = 'restricted'
              AND public_directory_visibility_reason = 'Contract expired: no currently effective verified commercial agreement'
             THEN true ELSE public_directory_visible END,
           public_directory_visibility_updated_at = CASE
             WHEN status::text = 'restricted'
              AND public_directory_visibility_reason = 'Contract expired: no currently effective verified commercial agreement'
             THEN v_now ELSE public_directory_visibility_updated_at END,
           public_directory_visibility_reason = CASE
             WHEN status::text = 'restricted'
              AND public_directory_visibility_reason = 'Contract expired: no currently effective verified commercial agreement'
             THEN 'Contract renewal effective: verified successor agreement activated'
             ELSE public_directory_visibility_reason END,
           updated_at = v_now
     WHERE id = v_row.vendor_id;

    UPDATE public.vendor_applications
       SET status = 'active', updated_at = v_now
     WHERE vendor_id = v_row.vendor_id
       AND status::text = 'restricted';

    v_successor_count := v_successor_count + 1;
    INSERT INTO public.vendor_agreement_audit_log(
      agreement_id, vendor_id, action, from_status, to_status, actor_user_id, metadata, created_at
    ) VALUES (
      v_row.id, v_row.vendor_id, 'renewal_successor_auto_activated', v_row.prior_status, 'active', NULL,
      jsonb_build_object(
        'agreementCode', v_row.agreement_code,
        'agreementVersion', v_row.agreement_version,
        'supersedesAgreementId', v_row.supersedes_agreement_id,
        'reconciledAt', v_now
      ), v_now
    );
  END LOOP;

  -- 3. Commercial vendors with agreement history but no effective verified
  -- agreement must stop selling. The account remains available for history and renewal.
  FOR v_row IN
    SELECT v.id, v.public_id
    FROM public.vendor_businesses v
    WHERE v.status::text = 'active'
      AND EXISTS (
        SELECT 1 FROM public.vendor_commercial_agreements any_agreement
        WHERE any_agreement.vendor_id = v.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.vendor_commercial_agreements effective
        WHERE effective.vendor_id = v.id
          AND effective.status = 'active'
          AND effective.signed_pdf_object_key IS NOT NULL
          AND effective.signed_pdf_sha256 IS NOT NULL
          AND effective.signed_document_received_at IS NOT NULL
          AND effective.govgr_reference IS NOT NULL
          AND btrim(effective.govgr_reference) <> ''
          AND effective.govgr_verified_at IS NOT NULL
          AND effective.govgr_verified_by IS NOT NULL
          AND effective.starts_at <= v_now
          AND (effective.ends_at IS NULL OR effective.ends_at > v_now)
      )
    FOR UPDATE OF v
  LOOP
    UPDATE public.vendor_businesses
       SET status = 'restricted',
           contract_ended_at = COALESCE(
             (SELECT max(a.ends_at) FROM public.vendor_commercial_agreements a
              WHERE a.vendor_id = v_row.id AND a.ends_at IS NOT NULL AND a.ends_at <= v_now),
             v_now
           ),
           public_directory_visible = false,
           public_directory_visibility_updated_at = CASE WHEN public_directory_visible THEN v_now ELSE public_directory_visibility_updated_at END,
           public_directory_visibility_reason = CASE
             WHEN public_directory_visible THEN 'Contract expired: no currently effective verified commercial agreement'
             ELSE public_directory_visibility_reason END,
           updated_at = v_now
     WHERE id = v_row.id;

    UPDATE public.vendor_applications
       SET status = 'restricted', updated_at = v_now
     WHERE vendor_id = v_row.id
       AND status::text = 'active';

    v_restricted_count := v_restricted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'expiredAgreements', v_expired_count,
    'activatedSuccessors', v_successor_count,
    'restrictedVendors', v_restricted_count,
    'reconciledAt', v_now
  );
END
$$;

REVOKE ALL ON FUNCTION bls_private.reconcile_vendor_agreement_lifecycle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.reconcile_vendor_agreement_lifecycle()
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON FUNCTION bls_private.reconcile_vendor_agreement_lifecycle()
  IS 'Expires ended vendor agreements, activates verified renewal successors at their effective start, and restricts vendors lacking an effective agreement.';

-- Reconcile legacy stale states as part of deployment. This is intentionally
-- idempotent; the scheduled runtime will continue to call the same function.
SELECT bls_private.reconcile_vendor_agreement_lifecycle();

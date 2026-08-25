-- KONTA MOU — enforce commercial agreement term boundaries and successor renewals.
-- Signed agreements remain immutable history. Renewal is represented by a linked successor
-- and commercial storefront access follows the currently effective agreement automatically.

-- Hosted production already carried these public-directory controls through an earlier
-- operational migration. Make them canonical here so clean databases and production agree.
ALTER TABLE public.vendor_businesses
  ADD COLUMN IF NOT EXISTS public_directory_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_directory_visibility_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS public_directory_visibility_reason text NULL,
  ADD COLUMN IF NOT EXISTS agreement_expiry_restricted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS agreement_expiry_previous_public_directory_visible boolean NULL,
  ADD COLUMN IF NOT EXISTS agreement_expiry_previous_visibility_reason text NULL;

CREATE INDEX IF NOT EXISTS vendor_commercial_agreements_effective_vendor_idx
  ON public.vendor_commercial_agreements(vendor_id, starts_at, ends_at)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS vendor_commercial_agreements_successor_unique_idx
  ON public.vendor_commercial_agreements(supersedes_agreement_id)
  WHERE supersedes_agreement_id IS NOT NULL
    AND status NOT IN ('rejected', 'terminated');

CREATE OR REPLACE FUNCTION bls_private.vendor_has_effective_commercial_agreement(
  p_vendor_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_commercial_agreements a
    WHERE a.vendor_id = p_vendor_id
      AND a.status = 'active'
      AND a.starts_at <= p_at
      AND (a.ends_at IS NULL OR a.ends_at > p_at)
  );
$$;

GRANT EXECUTE ON FUNCTION bls_private.vendor_has_effective_commercial_agreement(uuid, timestamptz)
  TO bls_app_runtime, bls_platform_runtime;

-- Keep the existing evidence gate and add the missing effective-date gate. A fully signed,
-- verified future renewal stays govgr_verified / eligible_for_activation until its start.
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
    IF NEW.starts_at > now() OR (NEW.ends_at IS NOT NULL AND NEW.ends_at <= now()) THEN
      RAISE EXCEPTION 'Agreement activation blocked: the commercial agreement is not currently effective';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Public visibility must not bypass an expired commercial term. Demo/research records are
-- intentionally excluded because they are not production commercial sellers.
CREATE OR REPLACE FUNCTION bls_private.guard_vendor_public_visibility_has_effective_agreement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.public_directory_visible IS TRUE
     AND COALESCE(NEW.demo_mode, false) IS FALSE
     AND NEW.public_id NOT LIKE 'vendor_research_%'
     AND EXISTS (
       SELECT 1
       FROM public.vendor_commercial_agreements a
       WHERE a.vendor_id = NEW.id
     )
     AND NOT bls_private.vendor_has_effective_commercial_agreement(NEW.id, now()) THEN
    RAISE EXCEPTION 'Vendor public visibility blocked: an effective commercial agreement is required';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_businesses_require_effective_agreement_for_visibility
  ON public.vendor_businesses;
CREATE TRIGGER vendor_businesses_require_effective_agreement_for_visibility
BEFORE INSERT OR UPDATE OF public_directory_visible
ON public.vendor_businesses
FOR EACH ROW
EXECUTE FUNCTION bls_private.guard_vendor_public_visibility_has_effective_agreement();

CREATE OR REPLACE FUNCTION bls_private.reconcile_vendor_agreement_lifecycle(
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE(
  expired_agreements integer,
  activated_successors integer,
  restricted_vendors integer,
  restored_vendors integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_expired integer := 0;
  v_activated integer := 0;
  v_restricted integer := 0;
  v_restored integer := 0;
  r record;
BEGIN
  -- 1. End active agreements exactly at the agreed term boundary.
  FOR r IN
    UPDATE public.vendor_commercial_agreements a
       SET status = 'expired', updated_at = p_at
     WHERE a.status = 'active'
       AND a.ends_at IS NOT NULL
       AND a.ends_at <= p_at
    RETURNING a.id, a.vendor_id
  LOOP
    v_expired := v_expired + 1;
    INSERT INTO public.vendor_agreement_audit_log(
      agreement_id, vendor_id, action, from_status, to_status, metadata, created_at
    ) VALUES (
      r.id, r.vendor_id, 'agreement_expired_automatically', 'active', 'expired',
      jsonb_build_object('reconciledAt', p_at), p_at
    );
  END LOOP;

  -- 2. A verified successor may be prepared in advance. Activate it only once its new
  -- term is actually effective; never supersede or mutate the predecessor early.
  FOR r IN
    SELECT a.id, a.vendor_id, a.status
    FROM public.vendor_commercial_agreements a
    WHERE a.supersedes_agreement_id IS NOT NULL
      AND a.status IN ('govgr_verified', 'eligible_for_activation')
      AND a.starts_at <= p_at
      AND (a.ends_at IS NULL OR a.ends_at > p_at)
      AND a.signed_pdf_object_key IS NOT NULL
      AND a.signed_pdf_sha256 IS NOT NULL
      AND a.signed_document_received_at IS NOT NULL
      AND a.govgr_reference IS NOT NULL
      AND btrim(a.govgr_reference) <> ''
      AND a.govgr_verified_at IS NOT NULL
      AND a.govgr_verified_by IS NOT NULL
    ORDER BY a.starts_at, a.created_at
    FOR UPDATE OF a
  LOOP
    UPDATE public.vendor_commercial_agreements
       SET status = 'active',
           activated_at = COALESCE(activated_at, p_at),
           activated_by = COALESCE(activated_by, govgr_verified_by),
           updated_at = p_at
     WHERE id = r.id;

    v_activated := v_activated + 1;
    INSERT INTO public.vendor_agreement_audit_log(
      agreement_id, vendor_id, action, from_status, to_status, metadata, created_at
    ) VALUES (
      r.id, r.vendor_id, 'renewal_activated_automatically', r.status, 'active',
      jsonb_build_object('reconciledAt', p_at), p_at
    );
  END LOOP;

  -- 3. A production commercial vendor with agreement history cannot remain active or public
  -- through a lapse. Preserve its previous visibility so an intentionally hidden shop stays
  -- hidden when a later renewal becomes effective.
  WITH candidates AS (
    SELECT v.id
    FROM public.vendor_businesses v
    WHERE v.status::text = 'active'
      AND COALESCE(v.demo_mode, false) IS FALSE
      AND v.public_id NOT LIKE 'vendor_research_%'
      AND EXISTS (
        SELECT 1 FROM public.vendor_commercial_agreements a WHERE a.vendor_id = v.id
      )
      AND NOT bls_private.vendor_has_effective_commercial_agreement(v.id, p_at)
    FOR UPDATE OF v
  )
  UPDATE public.vendor_businesses v
     SET agreement_expiry_restricted_at = COALESCE(v.agreement_expiry_restricted_at, p_at),
         agreement_expiry_previous_public_directory_visible = CASE
           WHEN v.agreement_expiry_restricted_at IS NULL THEN v.public_directory_visible
           ELSE v.agreement_expiry_previous_public_directory_visible
         END,
         agreement_expiry_previous_visibility_reason = CASE
           WHEN v.agreement_expiry_restricted_at IS NULL THEN v.public_directory_visibility_reason
           ELSE v.agreement_expiry_previous_visibility_reason
         END,
         status = 'restricted',
         public_directory_visible = false,
         public_directory_visibility_updated_at = p_at,
         public_directory_visibility_reason = 'Commercial agreement expired or is not currently effective',
         updated_at = p_at
    FROM candidates c
   WHERE v.id = c.id;
  GET DIAGNOSTICS v_restricted = ROW_COUNT;

  -- 4. Restore only vendors that this reconciler restricted. Manual suspended/closed states
  -- are never overridden. Restore the exact public-visibility state recorded before the lapse.
  WITH candidates AS (
    SELECT v.id
    FROM public.vendor_businesses v
    WHERE v.status::text = 'restricted'
      AND v.agreement_expiry_restricted_at IS NOT NULL
      AND bls_private.vendor_has_effective_commercial_agreement(v.id, p_at)
    FOR UPDATE OF v
  )
  UPDATE public.vendor_businesses v
     SET status = 'active',
         public_directory_visible = COALESCE(v.agreement_expiry_previous_public_directory_visible, false),
         public_directory_visibility_updated_at = p_at,
         public_directory_visibility_reason = v.agreement_expiry_previous_visibility_reason,
         agreement_expiry_restricted_at = NULL,
         agreement_expiry_previous_public_directory_visible = NULL,
         agreement_expiry_previous_visibility_reason = NULL,
         updated_at = p_at
    FROM candidates c
   WHERE v.id = c.id;
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  RETURN QUERY SELECT v_expired, v_activated, v_restricted, v_restored;
END
$$;

REVOKE ALL ON FUNCTION bls_private.reconcile_vendor_agreement_lifecycle(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.reconcile_vendor_agreement_lifecycle(timestamptz)
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON FUNCTION bls_private.reconcile_vendor_agreement_lifecycle(timestamptz)
  IS 'Expires ended agreements, activates due verified successors, restricts vendors during agreement lapses, and restores lifecycle-restricted vendors without losing prior visibility intent.';

-- KONTA MOY — vendor agreement document lifecycle and activation gate.
-- New vendor activation is blocked until a signed gov.gr agreement has been
-- stored and its reference explicitly verified by an administrator.

ALTER TABLE public.vendor_commercial_agreements
  ADD COLUMN IF NOT EXISTS vendor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS commercial_terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS unsigned_pdf_object_key text NULL,
  ADD COLUMN IF NOT EXISTS unsigned_pdf_sha256 text NULL,
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pdf_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS signed_pdf_object_key text NULL,
  ADD COLUMN IF NOT EXISTS signed_pdf_sha256 text NULL,
  ADD COLUMN IF NOT EXISTS signed_document_received_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS govgr_reference text NULL,
  ADD COLUMN IF NOT EXISTS govgr_verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS govgr_verified_by uuid NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS activated_by uuid NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS supersedes_agreement_id uuid NULL REFERENCES public.vendor_commercial_agreements(id),
  ADD COLUMN IF NOT EXISTS aade_reporting_status text NOT NULL DEFAULT 'not_assessed';

ALTER TABLE public.vendor_commercial_agreements
  DROP CONSTRAINT IF EXISTS vendor_commercial_agreements_status_check;

ALTER TABLE public.vendor_commercial_agreements
  ADD CONSTRAINT vendor_commercial_agreements_status_check
  CHECK (status IN (
    'draft',
    'data_complete',
    'pdf_generated',
    'sent',
    'pending_signature',
    'signed_received',
    'govgr_verified',
    'eligible_for_activation',
    'active',
    'suspended',
    'expired',
    'terminated',
    'superseded',
    'rejected'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='vendor_commercial_agreements_aade_reporting_status_check'
      AND conrelid='public.vendor_commercial_agreements'::regclass
  ) THEN
    ALTER TABLE public.vendor_commercial_agreements
      ADD CONSTRAINT vendor_commercial_agreements_aade_reporting_status_check
      CHECK (aade_reporting_status IN ('not_assessed','not_required','pending','submitted','exempt'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_commercial_agreements_global_code_version_key
  ON public.vendor_commercial_agreements(agreement_code, agreement_version);

CREATE INDEX IF NOT EXISTS vendor_commercial_agreements_signature_state_idx
  ON public.vendor_commercial_agreements(vendor_id, govgr_verified_at, signed_document_received_at);

CREATE TABLE IF NOT EXISTS public.vendor_agreement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.vendor_commercial_agreements(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  actor_user_id uuid NULL REFERENCES public.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_agreement_audit_log_agreement_idx
  ON public.vendor_agreement_audit_log(agreement_id, created_at DESC);

ALTER TABLE public.vendor_agreement_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_agreement_audit_log;
CREATE POLICY bls_platform_runtime_all ON public.vendor_agreement_audit_log
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.vendor_agreement_audit_log
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.peek_vendor_agreement_code()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_year text := to_char(current_date, 'YYYY');
  v_next integer;
BEGIN
  SELECT COALESCE(max(right(agreement_code, 6)::integer), 0) + 1
  INTO v_next
  FROM public.vendor_commercial_agreements
  WHERE agreement_code LIKE ('KM-AGR-' || v_year || '-______')
    AND right(agreement_code, 6) ~ '^[0-9]{6}$';

  RETURN 'KM-AGR-' || v_year || '-' || lpad(v_next::text, 6, '0');
END
$$;

CREATE OR REPLACE FUNCTION bls_private.generate_vendor_agreement_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_year text := to_char(current_date, 'YYYY');
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('kontamou.vendor_agreement_code', 0));

  SELECT COALESCE(max(right(agreement_code, 6)::integer), 0) + 1
  INTO v_next
  FROM public.vendor_commercial_agreements
  WHERE agreement_code LIKE ('KM-AGR-' || v_year || '-______')
    AND right(agreement_code, 6) ~ '^[0-9]{6}$';

  RETURN 'KM-AGR-' || v_year || '-' || lpad(v_next::text, 6, '0');
END
$$;

GRANT EXECUTE ON FUNCTION bls_private.peek_vendor_agreement_code()
  TO bls_app_runtime, bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.generate_vendor_agreement_code()
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.assign_vendor_agreement_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.agreement_code IS NULL OR btrim(NEW.agreement_code) = '' THEN
    NEW.agreement_code := bls_private.generate_vendor_agreement_code();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_commercial_agreements_assign_code
  ON public.vendor_commercial_agreements;
CREATE TRIGGER vendor_commercial_agreements_assign_code
BEFORE INSERT ON public.vendor_commercial_agreements
FOR EACH ROW
EXECUTE FUNCTION bls_private.assign_vendor_agreement_code();

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
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_commercial_agreements_verified_activation
  ON public.vendor_commercial_agreements;
CREATE TRIGGER vendor_commercial_agreements_verified_activation
BEFORE INSERT OR UPDATE OF status
ON public.vendor_commercial_agreements
FOR EACH ROW
EXECUTE FUNCTION bls_private.guard_verified_agreement_activation();

CREATE OR REPLACE FUNCTION bls_private.guard_vendor_activation_has_verified_agreement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status::text = 'active'
     AND OLD.status::text IS DISTINCT FROM 'active' THEN
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
      RAISE EXCEPTION 'Vendor activation blocked: a verified signed commercial agreement is required';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_businesses_require_verified_agreement
  ON public.vendor_businesses;
CREATE TRIGGER vendor_businesses_require_verified_agreement
BEFORE UPDATE OF status
ON public.vendor_businesses
FOR EACH ROW
EXECUTE FUNCTION bls_private.guard_vendor_activation_has_verified_agreement();

COMMENT ON COLUMN public.vendor_commercial_agreements.govgr_reference
  IS 'Reference / verification code of the fully signed gov.gr private agreement.';
COMMENT ON COLUMN public.vendor_commercial_agreements.govgr_verified_at
  IS 'Timestamp when an administrator explicitly verified the gov.gr reference.';
COMMENT ON COLUMN public.vendor_commercial_agreements.unsigned_pdf_object_key
  IS 'Private object-storage key for the immutable generated unsigned contract PDF.';
COMMENT ON COLUMN public.vendor_commercial_agreements.signed_pdf_object_key
  IS 'Private object-storage key for the final co-signed gov.gr PDF.';

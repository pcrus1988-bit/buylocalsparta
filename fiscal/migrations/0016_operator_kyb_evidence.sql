-- FISCAL 0016: operator-only KYB evidence checklist; not legal KYB approval.
-- Only references to independently collected evidence. Never store ID documents here.
BEGIN;
CREATE TABLE public.fiscal_kyb_evidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.fiscal_organizations(id) ON DELETE RESTRICT,
  check_type text NOT NULL CHECK (check_type IN (
    'business_registration','vat_identity','registered_address',
    'legal_representation','beneficial_ownership','signing_authority','service_agreement'
  )),
  outcome text NOT NULL CHECK (outcome IN ('requested','evidence_recorded','discrepancy')),
  source_kind text NOT NULL CHECK (source_kind IN (
    'none','gemi_public_registry','aade_public_check',
    'merchant_declaration','signed_agreement','manual_offline_review'
  )),
  source_reference text CHECK (
    source_reference IS NULL OR source_reference ~ '^[A-Za-z0-9._:-]{5,160}$'
  ),
  recorded_by_kind text NOT NULL CHECK (recorded_by_kind IN ('fiscal_admin','marketplace_super_admin')),
  recorded_by_ref text NOT NULL CHECK (char_length(recorded_by_ref) BETWEEN 5 AND 160),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (outcome='requested' AND source_kind='none' AND source_reference IS NULL) OR
    (outcome IN ('evidence_recorded','discrepancy')
      AND source_kind<>'none' AND source_reference IS NOT NULL)
  )
);
CREATE INDEX fiscal_kyb_evidence_tenant_timeline_idx
 ON public.fiscal_kyb_evidence_events(organization_id,recorded_at DESC,id DESC);
CREATE INDEX fiscal_kyb_evidence_latest_check_idx
 ON public.fiscal_kyb_evidence_events(organization_id,check_type,recorded_at DESC,id DESC);

CREATE FUNCTION public.fiscal_kyb_evidence_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'KYB evidence snapshots are immutable';
END $$;
CREATE TRIGGER fiscal_kyb_evidence_immutable_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_kyb_evidence_events
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_kyb_evidence_immutable();

ALTER TABLE public.fiscal_kyb_evidence_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_kyb_evidence_events FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_kyb_evidence_immutable() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_kyb_evidence_events FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.fiscal_kyb_evidence_immutable() FROM %I',r);
 END LOOP;
END $$;
COMMIT;

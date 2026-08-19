-- KONTA MOY — harden the vendor agreement document vault after database-backed storage rollout.
-- Keep contract PDFs private to the platform runtime and enforce RLS even for table owners.

ALTER TABLE public.vendor_agreement_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_agreement_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_agreement_documents;
CREATE POLICY bls_platform_runtime_all ON public.vendor_agreement_documents
  FOR ALL
  TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.vendor_agreement_documents
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.vendor_agreement_documents
  TO bls_platform_runtime;

COMMENT ON TABLE public.vendor_agreement_documents
  IS 'Private binary vault for vendor agreement PDF evidence. Forced RLS; platform runtime only.';

-- KONTA MOY — private database-backed vault for vendor agreement PDFs.
-- This removes the agreement lifecycle's dependency on an externally configured
-- S3 bucket while preserving immutable object keys and SHA-256 evidence.

CREATE TABLE IF NOT EXISTS public.vendor_agreement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.vendor_commercial_agreements(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  document_kind text NOT NULL CHECK (document_kind IN ('unsigned','signed-govgr')),
  content_type text NOT NULL DEFAULT 'application/pdf' CHECK (content_type = 'application/pdf'),
  content bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 15728640),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_agreement_documents_content_size_matches CHECK (octet_length(content) = byte_size),
  UNIQUE (agreement_id, document_kind)
);

CREATE INDEX IF NOT EXISTS vendor_agreement_documents_agreement_idx
  ON public.vendor_agreement_documents(agreement_id, document_kind);

ALTER TABLE public.vendor_agreement_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_agreement_documents;
CREATE POLICY bls_platform_runtime_all ON public.vendor_agreement_documents
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.vendor_agreement_documents
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.vendor_agreement_documents
  IS 'Private binary vault for immutable/generated vendor agreement PDF evidence. Access is restricted to the platform runtime.';
COMMENT ON COLUMN public.vendor_agreement_documents.object_key
  IS 'Stable logical object key retained independently of the physical storage implementation.';
COMMENT ON COLUMN public.vendor_agreement_documents.sha256
  IS 'SHA-256 digest of the exact stored PDF bytes.';

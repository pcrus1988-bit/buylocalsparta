-- Paint & Build completion hardening: extensible customer documents and explicit customer RLS scope.
BEGIN;

ALTER TABLE public.customer_project_documents
  ADD COLUMN IF NOT EXISTS document_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.customer_project_documents
  DROP CONSTRAINT IF EXISTS customer_project_documents_document_type_check;
ALTER TABLE public.customer_project_documents
  DROP CONSTRAINT IF EXISTS customer_project_documents_document_type_format_check;
ALTER TABLE public.customer_project_documents
  ADD CONSTRAINT customer_project_documents_document_type_format_check
  CHECK (document_type ~ '^[a-z0-9_]{3,64}$');

ALTER TABLE public.customer_project_documents
  DROP CONSTRAINT IF EXISTS customer_project_documents_document_metadata_object_check;
ALTER TABLE public.customer_project_documents
  ADD CONSTRAINT customer_project_documents_document_metadata_object_check
  CHECK (jsonb_typeof(document_metadata) = 'object');

DROP POLICY IF EXISTS paint_build_guidance_snapshots_customer_own ON public.paint_build_guidance_snapshots;
CREATE POLICY paint_build_guidance_snapshots_customer_own
  ON public.paint_build_guidance_snapshots
  FOR SELECT
  TO authenticated
  USING (
    user_id IS NOT NULL
    AND current_setting('app.actor_user_id', true) <> ''
    AND user_id::text = current_setting('app.actor_user_id', true)
  );

DROP POLICY IF EXISTS customer_project_documents_customer_own ON public.customer_project_documents;
CREATE POLICY customer_project_documents_customer_own
  ON public.customer_project_documents
  FOR SELECT
  TO authenticated
  USING (
    current_setting('app.actor_user_id', true) <> ''
    AND user_id::text = current_setting('app.actor_user_id', true)
  );

REVOKE ALL ON TABLE public.paint_build_guidance_snapshots FROM anon;
REVOKE ALL ON TABLE public.customer_project_documents FROM anon;
GRANT SELECT ON TABLE public.paint_build_guidance_snapshots TO authenticated;
GRANT SELECT ON TABLE public.customer_project_documents TO authenticated;

COMMIT;

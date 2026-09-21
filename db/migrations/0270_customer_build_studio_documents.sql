-- KONTA MOY — immutable customer Paint & Build Studio project-guide snapshots.
-- The customer document vault is server-only: public Data API roles receive no
-- table privileges. RLS remains enabled as defense in depth and the stored
-- snapshot is immutable so later catalogue changes cannot rewrite old guidance.

BEGIN;

CREATE TABLE public.customer_build_studio_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'paint_build_project_guide'
    CHECK (document_type = 'paint_build_project_guide'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  scenario_key text NOT NULL CHECK (scenario_key ~ '^[a-z0-9_]{1,96}$'),
  snapshot_version integer NOT NULL DEFAULT 1 CHECK (snapshot_version = 1),
  renderer_version integer NOT NULL DEFAULT 1 CHECK (renderer_version >= 1),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_build_studio_documents_user_created_idx
  ON public.customer_build_studio_documents(user_id, created_at DESC);

COMMENT ON TABLE public.customer_build_studio_documents IS
  'Private immutable Paint & Build Studio project-guide snapshots owned by a KONTA MOY customer.';
COMMENT ON COLUMN public.customer_build_studio_documents.snapshot IS
  'Exact project, verified manufacturer-product, customer guidance, raw guidance and evidence snapshot captured at document creation time.';

ALTER TABLE public.customer_build_studio_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_build_studio_documents_customer_select
  ON public.customer_build_studio_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = customer_build_studio_documents.user_id
        AND (
          u.public_id = current_setting('app.actor_user_id', true)
          OR u.id::text = current_setting('app.actor_user_id', true)
        )
    )
  );

CREATE POLICY customer_build_studio_documents_platform
  ON public.customer_build_studio_documents
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.customer_build_studio_documents FROM anon, authenticated;

CREATE OR REPLACE FUNCTION bls_private.prevent_customer_build_studio_document_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'customer_build_studio_documents snapshots are immutable';
END;
$$;

REVOKE ALL ON FUNCTION bls_private.prevent_customer_build_studio_document_update() FROM PUBLIC;

CREATE TRIGGER customer_build_studio_documents_immutable
  BEFORE UPDATE ON public.customer_build_studio_documents
  FOR EACH ROW
  EXECUTE FUNCTION bls_private.prevent_customer_build_studio_document_update();

COMMIT;

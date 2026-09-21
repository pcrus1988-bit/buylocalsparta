-- KONTA MOY Paint & Build immutable guidance snapshots and private customer documents.
BEGIN;

ALTER TABLE public.build_stop_conditions
  ADD COLUMN IF NOT EXISTS blocks_product_recommendation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocks_application boolean NOT NULL DEFAULT false;

UPDATE public.build_stop_conditions
SET blocks_product_recommendation = true,
    blocks_application = true
WHERE severity = 'BLOCK'
  AND (blocks_product_recommendation = false OR blocks_application = false);

CREATE TABLE IF NOT EXISTS public.paint_build_guidance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('PBS_' || replace(gen_random_uuid()::text,'-','')),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  scenario_key text NOT NULL,
  project_type text NOT NULL,
  project_name text NOT NULL,
  resolver_version text NOT NULL,
  project_snapshot jsonb NOT NULL CHECK (jsonb_typeof(project_snapshot)='object'),
  guidance_snapshot jsonb NOT NULL CHECK (jsonb_typeof(guidance_snapshot)='object'),
  guidance_conflict boolean NOT NULL DEFAULT false,
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK (length(btrim(scenario_key)) > 0),
  CHECK (length(btrim(project_type)) > 0),
  CHECK (length(btrim(project_name)) > 0),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS paint_build_guidance_snapshots_user_created_idx
  ON public.paint_build_guidance_snapshots(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS paint_build_guidance_snapshots_expiry_idx
  ON public.paint_build_guidance_snapshots(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.customer_project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('PBD_' || replace(gen_random_uuid()::text,'-','')),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  guidance_snapshot_id uuid NOT NULL REFERENCES public.paint_build_guidance_snapshots(id) ON DELETE RESTRICT,
  document_type text NOT NULL DEFAULT 'paint_build_project_guide'
    CHECK (document_type='paint_build_project_guide'),
  project_name text NOT NULL,
  project_type text NOT NULL,
  scenario_key text NOT NULL,
  guidance_snapshot jsonb NOT NULL CHECK (jsonb_typeof(guidance_snapshot)='object'),
  content_type text NOT NULL DEFAULT 'application/pdf' CHECK (content_type='application/pdf'),
  content bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guidance_snapshot_id)
);

CREATE INDEX IF NOT EXISTS customer_project_documents_user_created_idx
  ON public.customer_project_documents(user_id, created_at DESC);

ALTER TABLE public.paint_build_guidance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paint_build_guidance_snapshots_platform ON public.paint_build_guidance_snapshots;
CREATE POLICY paint_build_guidance_snapshots_platform
  ON public.paint_build_guidance_snapshots FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS paint_build_guidance_snapshots_customer_own ON public.paint_build_guidance_snapshots;
CREATE POLICY paint_build_guidance_snapshots_customer_own
  ON public.paint_build_guidance_snapshots FOR SELECT
  USING (user_id IS NOT NULL AND user_id::text = current_setting('app.actor_user_id', true));

DROP POLICY IF EXISTS customer_project_documents_platform ON public.customer_project_documents;
CREATE POLICY customer_project_documents_platform
  ON public.customer_project_documents FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS customer_project_documents_customer_own ON public.customer_project_documents;
CREATE POLICY customer_project_documents_customer_own
  ON public.customer_project_documents FOR SELECT
  USING (user_id::text = current_setting('app.actor_user_id', true));

REVOKE ALL ON TABLE public.paint_build_guidance_snapshots FROM anon;
REVOKE ALL ON TABLE public.customer_project_documents FROM anon;
GRANT SELECT ON TABLE public.paint_build_guidance_snapshots TO authenticated;
GRANT SELECT ON TABLE public.customer_project_documents TO authenticated;

COMMIT;

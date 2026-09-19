-- KONTA MOY — public Style Builder share snapshots.
-- Public share records contain only presentation-safe product references and
-- never store clothing sizes, uploaded images, account details or other
-- customer profile data. Access is server-side through the platform runtime.

BEGIN;

CREATE TABLE public.shared_style_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  audience text NOT NULL CHECK (audience IN ('women','men')),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','konta')),
  composition jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(composition)='array'),
  total_minor integer NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shared_style_looks_created_idx
  ON public.shared_style_looks(created_at DESC);

COMMENT ON TABLE public.shared_style_looks IS
  'Server-only public Style Builder share snapshots. Contains product references required to render a shared look; no customer profile, clothing sizes or uploaded images.';
COMMENT ON COLUMN public.shared_style_looks.composition IS
  'Sanitized public product snapshot for a shared Style Builder look.';

ALTER TABLE public.shared_style_looks ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_style_looks_platform ON public.shared_style_looks
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.shared_style_looks FROM anon, authenticated;

COMMIT;

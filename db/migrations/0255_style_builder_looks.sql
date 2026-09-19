-- KONTA MOY — account-backed Style Builder looks.
-- Clothing sizes and style preferences are private customer data. The table is
-- server-only, RLS protected, and explicitly not exposed through the Data API.

BEGIN;

CREATE TABLE public.customer_style_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  audience text NOT NULL CHECK (audience IN ('women','men')),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','konta')),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile)='object'),
  composition jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(composition)='array'),
  total_minor integer NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  share_enabled boolean NOT NULL DEFAULT false,
  share_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_style_looks_user_updated_idx
  ON public.customer_style_looks(user_id, updated_at DESC);

COMMENT ON TABLE public.customer_style_looks IS
  'Private saved Style Builder compositions. Stores clothing-size/style preferences and selected public product references for the owning KONTA MOY customer.';
COMMENT ON COLUMN public.customer_style_looks.profile IS
  'Private Style Builder preferences such as clothing sizes, favourite colours, optional budget and favourite brands. No uploaded photos are stored.';
COMMENT ON COLUMN public.customer_style_looks.composition IS
  'Snapshot of selected public product references needed to reopen/share the look.';

ALTER TABLE public.customer_style_looks ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_style_looks_customer_own ON public.customer_style_looks
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id=customer_style_looks.user_id
        AND (
          u.public_id=current_setting('app.actor_user_id', true)
          OR u.id::text=current_setting('app.actor_user_id', true)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id=customer_style_looks.user_id
        AND (
          u.public_id=current_setting('app.actor_user_id', true)
          OR u.id::text=current_setting('app.actor_user_id', true)
        )
    )
  );

CREATE POLICY customer_style_looks_platform ON public.customer_style_looks
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.customer_style_looks FROM anon, authenticated;

COMMIT;

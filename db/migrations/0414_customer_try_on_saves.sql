-- KONTA MOY — private account-saved virtual try-on results.
-- The customer's source/reference photo is intentionally NOT persisted server-side.
-- Only an explicitly starred generated output is retained for later comparison.

BEGIN;

CREATE TABLE public.customer_try_on_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES public.canonical_variants(id) ON DELETE CASCADE,
  product_title text NOT NULL CHECK (length(btrim(product_title)) BETWEEN 1 AND 240),
  product_slug text NOT NULL CHECK (length(btrim(product_slug)) BETWEEN 1 AND 180),
  provider text NOT NULL DEFAULT 'fashn' CHECK (provider='fashn'),
  model_name text NOT NULL CHECK (model_name='tryon-v1.6'),
  prediction_id text NOT NULL CHECK (length(btrim(prediction_id)) BETWEEN 8 AND 160),
  object_key text NOT NULL UNIQUE CHECK (length(btrim(object_key)) BETWEEN 1 AND 700),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, prediction_id)
);

CREATE INDEX customer_try_on_saves_user_created_idx
  ON public.customer_try_on_saves(user_id, created_at DESC);

COMMENT ON TABLE public.customer_try_on_saves IS
  'Private customer-saved virtual try-on outputs. Rows exist only after the customer explicitly saves/stars a generated preview.';
COMMENT ON COLUMN public.customer_try_on_saves.object_key IS
  'Private object-storage key for the explicitly saved generated output. Never a public URL.';
COMMENT ON COLUMN public.customer_try_on_saves.prediction_id IS
  'Provider prediction identifier retained for traceability and duplicate prevention. The customer reference photo is not stored here or elsewhere server-side by Try On Me.';

ALTER TABLE public.customer_try_on_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_try_on_saves_customer_own ON public.customer_try_on_saves
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id=customer_try_on_saves.user_id
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
      WHERE u.id=customer_try_on_saves.user_id
        AND (
          u.public_id=current_setting('app.actor_user_id', true)
          OR u.id::text=current_setting('app.actor_user_id', true)
        )
    )
  );

CREATE POLICY customer_try_on_saves_platform ON public.customer_try_on_saves
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.customer_try_on_saves FROM anon, authenticated;

COMMIT;

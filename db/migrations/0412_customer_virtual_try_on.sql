-- KONTA MOY — private customer virtual try-on profiles and ephemeral FASHN VTON previews.
-- Reference photos and generated previews are private personal media. The browser never
-- receives storage object keys; all reads are owner-authenticated server routes.
BEGIN;

CREATE TABLE public.customer_tryon_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 240),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  expected_byte_size bigint NOT NULL CHECK (expected_byte_size BETWEEN 1 AND 15728640),
  consent_version text NOT NULL CHECK (length(btrim(consent_version)) BETWEEN 1 AND 64),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','completed','expired','failed')),
  expires_at timestamptz NOT NULL,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX customer_tryon_upload_intents_user_created_idx
  ON public.customer_tryon_upload_intents(user_id,created_at DESC);
CREATE INDEX customer_tryon_upload_intents_expiry_idx
  ON public.customer_tryon_upload_intents(expires_at)
  WHERE status='initiated';

CREATE TABLE public.customer_tryon_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  reference_object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 15728640),
  photo_version integer NOT NULL DEFAULT 1 CHECK (photo_version > 0),
  consent_version text NOT NULL CHECK (length(btrim(consent_version)) BETWEEN 1 AND 64),
  consented_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_tryon_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES public.canonical_variants(id) ON DELETE CASCADE,
  profile_version integer NOT NULL CHECK (profile_version > 0),
  provider text NOT NULL DEFAULT 'fashn-vton',
  model_version text NOT NULL DEFAULT '1.5',
  garment_category text NOT NULL CHECK (garment_category IN ('tops','bottoms','one-pieces')),
  garment_fingerprint text NOT NULL CHECK (length(btrim(garment_fingerprint)) BETWEEN 1 AND 256),
  cache_key text NOT NULL CHECK (length(cache_key)=64),
  object_key text NOT NULL UNIQUE,
  content_type text,
  byte_size bigint,
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating','ready','failed','expired','saved')),
  expires_at timestamptz,
  saved_at timestamptz,
  generated_at timestamptz,
  last_accessed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,cache_key),
  CHECK (byte_size IS NULL OR byte_size > 0)
);

CREATE INDEX customer_tryon_previews_user_created_idx
  ON public.customer_tryon_previews(user_id,created_at DESC);
CREATE INDEX customer_tryon_previews_cleanup_idx
  ON public.customer_tryon_previews(expires_at)
  WHERE status='ready' AND saved_at IS NULL;

COMMENT ON TABLE public.customer_tryon_upload_intents IS
  'Short-lived private upload intents for a customer My Model reference photo. Server-only; object keys are never returned by read APIs.';
COMMENT ON TABLE public.customer_tryon_profiles IS
  'Private customer-owned virtual try-on reference photo metadata. The image itself is held in private object storage.';
COMMENT ON TABLE public.customer_tryon_previews IS
  'Customer-owned FASHN VTON outputs. Unsaved ready previews expire after a short sliding TTL; starred previews become durable saved looks.';
COMMENT ON COLUMN public.customer_tryon_previews.garment_fingerprint IS
  'Server-derived identity of the governed product image used for generation; never accepts a browser supplied URL.';

ALTER TABLE public.customer_tryon_upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tryon_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tryon_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_tryon_upload_intents_own ON public.customer_tryon_upload_intents
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id=customer_tryon_upload_intents.user_id
      AND (u.public_id=current_setting('app.actor_user_id',true)
        OR u.id::text=current_setting('app.actor_user_id',true))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id=customer_tryon_upload_intents.user_id
      AND (u.public_id=current_setting('app.actor_user_id',true)
        OR u.id::text=current_setting('app.actor_user_id',true))
  ));

CREATE POLICY customer_tryon_profiles_own ON public.customer_tryon_profiles
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id=customer_tryon_profiles.user_id
      AND (u.public_id=current_setting('app.actor_user_id',true)
        OR u.id::text=current_setting('app.actor_user_id',true))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id=customer_tryon_profiles.user_id
      AND (u.public_id=current_setting('app.actor_user_id',true)
        OR u.id::text=current_setting('app.actor_user_id',true))
  ));

CREATE POLICY customer_tryon_previews_own ON public.customer_tryon_previews
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id=customer_tryon_previews.user_id
      AND (u.public_id=current_setting('app.actor_user_id',true)
        OR u.id::text=current_setting('app.actor_user_id',true))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id=customer_tryon_previews.user_id
      AND (u.public_id=current_setting('app.actor_user_id',true)
        OR u.id::text=current_setting('app.actor_user_id',true))
  ));

CREATE POLICY customer_tryon_upload_intents_platform ON public.customer_tryon_upload_intents
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY customer_tryon_profiles_platform ON public.customer_tryon_profiles
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY customer_tryon_previews_platform ON public.customer_tryon_previews
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.customer_tryon_upload_intents FROM anon,authenticated;
REVOKE ALL ON TABLE public.customer_tryon_profiles FROM anon,authenticated;
REVOKE ALL ON TABLE public.customer_tryon_previews FROM anon,authenticated;

COMMIT;

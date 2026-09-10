-- Manage the Sparta local-market story card shown beside the homepage hero copy.
-- Text, CTA, visibility and the exact uploaded image are server-private and editable through Admin.
BEGIN;

CREATE TABLE bls_private.homepage_local_market_scene (
  id text PRIMARY KEY,
  eyebrow text NOT NULL CHECK (length(trim(eyebrow)) BETWEEN 1 AND 120),
  headline text NOT NULL CHECK (length(trim(headline)) BETWEEN 1 AND 240),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 1200),
  cta_label text NOT NULL DEFAULT '' CHECK (length(cta_label) <= 120),
  cta_url text NOT NULL DEFAULT '' CHECK (length(cta_url) <= 1000),
  alt_text text NOT NULL DEFAULT '' CHECK (length(alt_text) <= 500),
  is_visible boolean NOT NULL DEFAULT true,
  image_bytes bytea,
  image_content_type text,
  image_etag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_local_market_image_state_check CHECK (
    (image_bytes IS NULL AND image_content_type IS NULL AND image_etag IS NULL)
    OR
    (image_bytes IS NOT NULL AND image_content_type IS NOT NULL AND image_etag IS NOT NULL)
  ),
  CONSTRAINT homepage_local_market_content_type_check CHECK (
    image_content_type IS NULL
    OR image_content_type IN ('image/jpeg','image/png','image/webp','image/gif','image/avif')
  ),
  CONSTRAINT homepage_local_market_cta_pair_check CHECK (
    (length(trim(cta_label)) = 0 AND length(trim(cta_url)) = 0)
    OR
    (length(trim(cta_label)) > 0 AND length(trim(cta_url)) > 0)
  )
);

INSERT INTO bls_private.homepage_local_market_scene (
  id,
  eyebrow,
  headline,
  body,
  cta_label,
  cta_url,
  alt_text,
  is_visible
) VALUES (
  'sparta-local-market',
  'ΣΠΑΡΤΗ · ΤΟΠΙΚΗ ΑΓΟΡΑ',
  'Η πόλη πίσω από τα προϊόντα.',
  'Άνθρωποι, προϊόντα και πραγματικά καταστήματα — στο ίδιο μέρος.',
  'Γνώρισε τα καταστήματα',
  '/shops',
  'Η κεντρική πλατεία της Σπάρτης με τον Ταΰγετο στο βάθος.',
  true
)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE bls_private.homepage_local_market_scene
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bls_private.homepage_local_market_scene
  TO bls_app_runtime, bls_platform_runtime;

COMMIT;

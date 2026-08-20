-- Persist homepage hero carousel content without requiring external object-storage credentials.
-- Uploaded banner bytes remain server-private in the bls_private schema and are exposed only
-- through the authenticated Admin workflow / public read-only image route.
BEGIN;

CREATE TABLE bls_private.homepage_hero_slides (
  id text PRIMARY KEY,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  alt_text text NOT NULL DEFAULT '' CHECK (length(alt_text) <= 500),
  link_url text,
  sort_order integer NOT NULL DEFAULT 100,
  is_visible boolean NOT NULL DEFAULT true,
  is_seed boolean NOT NULL DEFAULT false,
  static_image_url text,
  image_bytes bytea,
  image_content_type text,
  image_etag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_hero_image_source_check CHECK (
    (is_seed AND static_image_url IS NOT NULL AND image_bytes IS NULL)
    OR
    (NOT is_seed AND static_image_url IS NULL AND image_bytes IS NOT NULL
      AND image_content_type IS NOT NULL AND image_etag IS NOT NULL)
  ),
  CONSTRAINT homepage_hero_content_type_check CHECK (
    image_content_type IS NULL
    OR image_content_type IN ('image/jpeg','image/png','image/webp','image/gif','image/avif')
  )
);

CREATE INDEX homepage_hero_slides_order_idx
  ON bls_private.homepage_hero_slides(sort_order, created_at, id);

INSERT INTO bls_private.homepage_hero_slides (
  id, title, alt_text, link_url, sort_order, is_visible, is_seed, static_image_url
) VALUES (
  'konta-mou-white-night-2026',
  'ΚΟΝΤΑ ΜΟΥ · Λευκή Νύχτα Σπάρτης',
  'ΚΟΝΤΑ ΜΟΥ — διαγωνισμός Λευκής Νύχτας Σπάρτης με κουπόνια και πρόσκληση εγγραφής.',
  NULL,
  0,
  true,
  true,
  '/hero/konta-mou-white-night-2026.avif'
)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE bls_private.homepage_hero_slides
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bls_private.homepage_hero_slides
  TO bls_app_runtime, bls_platform_runtime;

COMMIT;

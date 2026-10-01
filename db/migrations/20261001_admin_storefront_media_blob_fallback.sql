-- Emergency fallback for Admin storefront media when the external object-storage
-- pipeline is unavailable. Bytes remain in the private schema and are never exposed
-- directly; all reads continue through authenticated/admin or governed public routes.
CREATE TABLE IF NOT EXISTS bls_private.vendor_storefront_media_blobs (
  media_id uuid PRIMARY KEY REFERENCES public.product_media(id) ON DELETE CASCADE,
  image_bytes bytea NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 3500000),
  sha256 character(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  validation_method text NOT NULL DEFAULT 'magic-bytes-v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE bls_private.vendor_storefront_media_blobs FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE bls_private.vendor_storefront_media_blobs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE bls_private.vendor_storefront_media_blobs FROM authenticated';
  END IF;
END $$;

COMMENT ON TABLE bls_private.vendor_storefront_media_blobs IS
  'Private emergency storage for Admin vendor storefront images when the S3 media pipeline is unavailable.';

-- Vendor storefront media roles, publication governance and profile-upload subjects.
BEGIN;

ALTER TABLE media_upload_intents
  ALTER COLUMN canonical_variant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'catalog'
    CHECK (purpose IN ('catalog','vendor_profile')),
  ADD COLUMN IF NOT EXISTS profile_role text
    CHECK (profile_role IN ('logo','storefront','team','gallery'));

ALTER TABLE media_upload_intents
  DROP CONSTRAINT IF EXISTS media_upload_intents_subject_ck,
  ADD CONSTRAINT media_upload_intents_subject_ck CHECK (
    (purpose='catalog' AND canonical_variant_id IS NOT NULL AND profile_role IS NULL)
    OR
    (purpose='vendor_profile' AND canonical_variant_id IS NULL AND profile_role IS NOT NULL AND kind='image')
  );

CREATE TABLE vendor_profile_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES product_media(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('logo','storefront','team','gallery')),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft','published','archived')),
  created_by uuid REFERENCES users(id),
  published_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  archived_at timestamptz,
  UNIQUE (vendor_id, media_id),
  CHECK (publication_status <> 'published' OR published_at IS NOT NULL)
);

CREATE INDEX vendor_profile_media_vendor_status_idx
  ON vendor_profile_media(vendor_id, publication_status, role, sort_order, created_at DESC);

CREATE UNIQUE INDEX vendor_profile_media_published_singleton_uidx
  ON vendor_profile_media(vendor_id, role)
  WHERE publication_status='published' AND role IN ('logo','storefront','team');

ALTER TABLE vendor_profile_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_profile_media_vendor_select ON vendor_profile_media
  FOR SELECT USING (
    vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
    OR (SELECT bls_private.is_platform_runtime())
  );

CREATE POLICY vendor_profile_media_vendor_insert ON vendor_profile_media
  FOR INSERT WITH CHECK (
    (
      vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
      AND publication_status='draft'
      AND published_by IS NULL
      AND published_at IS NULL
    )
    OR (SELECT bls_private.is_platform_runtime())
  );

CREATE POLICY vendor_profile_media_vendor_update ON vendor_profile_media
  FOR UPDATE USING (
    vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
    OR (SELECT bls_private.is_platform_runtime())
  ) WITH CHECK (
    (
      vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
      AND publication_status IN ('draft','archived')
    )
    OR (SELECT bls_private.is_platform_runtime())
  );

CREATE POLICY vendor_profile_media_vendor_delete ON vendor_profile_media
  FOR DELETE USING (
    (
      vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
      AND publication_status IN ('draft','archived')
    )
    OR (SELECT bls_private.is_platform_runtime())
  );

COMMIT;

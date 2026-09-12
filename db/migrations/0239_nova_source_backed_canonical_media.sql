-- 0239_nova_source_backed_canonical_media.sql
-- Treat trusted NOVA / BrandsGateway catalogue images as first-class canonical
-- media without copying the supplier's entire catalogue into private object storage.
-- sort_order=0 is the supplier's first image (_1 / position 0), followed by _2, _3, ...

ALTER TABLE product_media
  ALTER COLUMN object_key DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES catalog_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_media_source_url_requires_source_id'
      AND conrelid = 'product_media'::regclass
  ) THEN
    ALTER TABLE product_media
      ADD CONSTRAINT product_media_source_url_requires_source_id
      CHECK (source_url IS NULL OR source_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_media_source_id_idx
  ON product_media(source_id)
  WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_media_source_image_unique_idx
  ON product_media(canonical_variant_id, vendor_id, source_id, source_url)
  WHERE kind='image' AND source_url IS NOT NULL;

WITH expanded AS (
  SELECT
    cv.id AS canonical_variant_id,
    vo.vendor_id,
    csp.id AS source_product_id,
    cs.id AS source_id,
    cs.website AS source_website,
    COALESCE(NULLIF(csp.title, ''), 'Προϊόν') AS source_title,
    COALESCE(
      NULLIF(img.value->>'src', ''),
      NULLIF(img.value->>'url', ''),
      NULLIF(img.value->>'image', '')
    ) AS source_url,
    img.ordinality,
    CASE
      WHEN (img.value->>'position') ~ '^[0-9]+$' THEN (img.value->>'position')::integer
      ELSE (img.ordinality - 1)::integer
    END AS source_position
  FROM catalog_source_products csp
  JOIN catalog_sources cs ON cs.id=csp.source_id
  JOIN dropship_supplier_offers dso ON dso.source_product_id=csp.id
  JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
  JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
  CROSS JOIN LATERAL jsonb_array_elements(csp.normalized_payload->'images')
    WITH ORDINALITY AS img(value, ordinality)
  WHERE cs.code='nova-brandsgateway'
    AND jsonb_typeof(csp.normalized_payload->'images')='array'
), valid AS (
  SELECT *
  FROM expanded
  WHERE source_url LIKE 'https://%'
    AND regexp_replace(lower(split_part(split_part(source_url, '://', 2), '/', 1)), '^www\.', '')
      = regexp_replace(lower(split_part(split_part(source_website, '://', 2), '/', 1)), '^www\.', '')
), deduped AS (
  SELECT *,
         row_number() OVER (
           PARTITION BY canonical_variant_id, vendor_id, source_product_id, source_url
           ORDER BY source_position, ordinality
         ) AS duplicate_rank
  FROM valid
), ranked AS (
  SELECT *,
         (row_number() OVER (
           PARTITION BY canonical_variant_id, vendor_id, source_product_id
           ORDER BY source_position, ordinality, source_url
         ) - 1)::integer AS canonical_sort_order
  FROM deduped
  WHERE duplicate_rank=1
), prepared AS (
  SELECT
    gen_random_uuid() AS id,
    'media_' || replace(gen_random_uuid()::text, '-', '') AS public_id,
    canonical_variant_id,
    vendor_id,
    source_id,
    source_url,
    source_product_id,
    source_title,
    canonical_sort_order,
    CASE
      WHEN lower(split_part(source_url, '?', 1)) ~ '\.png$' THEN 'image/png'
      WHEN lower(split_part(source_url, '?', 1)) ~ '\.webp$' THEN 'image/webp'
      WHEN lower(split_part(source_url, '?', 1)) ~ '\.(jpg|jpeg)$' THEN 'image/jpeg'
      ELSE NULL
    END AS content_type,
    regexp_replace(split_part(source_url, '?', 1), '^.*/', '') AS basename
  FROM ranked
)
INSERT INTO product_media(
  id,
  public_id,
  canonical_variant_id,
  vendor_id,
  kind,
  object_key,
  alt_text,
  rights_owner,
  rights_status,
  moderation_status,
  sort_order,
  created_at,
  original_filename,
  content_type,
  scan_status,
  reviewed_at,
  source_id,
  source_url
)
SELECT
  id,
  public_id,
  canonical_variant_id,
  vendor_id,
  'image',
  NULL,
  source_title || ' — φωτογραφία ' || (canonical_sort_order + 1)::text,
  'BrandsGateway / Nova',
  'approved',
  'approved',
  canonical_sort_order,
  now(),
  left('nova:' || source_product_id::text || ':' || canonical_sort_order::text || ':' || basename, 255),
  content_type,
  'clean',
  now(),
  source_id,
  source_url
FROM prepared
ON CONFLICT (canonical_variant_id, vendor_id, source_id, source_url)
  WHERE kind='image' AND source_url IS NOT NULL
DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  alt_text=EXCLUDED.alt_text,
  original_filename=EXCLUDED.original_filename,
  rights_owner=EXCLUDED.rights_owner,
  rights_status='approved',
  moderation_status='approved',
  scan_status='clean',
  content_type=EXCLUDED.content_type,
  reviewed_at=now();

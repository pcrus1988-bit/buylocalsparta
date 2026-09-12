-- 0236_bazaar_commerce_channel.sql
-- Establish BAZAAR as a first-class commerce channel, isolated from the normal catalogue.
-- Existing variants remain in the normal channel. No live catalogue backfill is performed here.

ALTER TABLE public.canonical_variants
  ADD COLUMN IF NOT EXISTS commerce_channel text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS bazaar_source text;

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_condition_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_condition_check
  CHECK (
    condition = ANY (
      ARRAY[
        'new'::text,
        'refurbished'::text,
        'used'::text,
        'preloved'::text,
        'preowned_defect'::text,
        'open_box'::text
      ]
    )
  );

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_commerce_channel_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_commerce_channel_check
  CHECK (commerce_channel = ANY (ARRAY['normal'::text, 'bazaar'::text]));

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_bazaar_source_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_bazaar_source_check
  CHECK (
    bazaar_source IS NULL
    OR bazaar_source = ANY (
      ARRAY[
        'supplier_preloved'::text,
        'supplier_preowned_defect'::text,
        'customer_return'::text,
        'open_box'::text,
        'display_stock'::text,
        'damaged_packaging'::text,
        'admin_curated'::text
      ]
    )
  );

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_bazaar_source_channel_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_bazaar_source_channel_check
  CHECK (commerce_channel = 'bazaar' OR bazaar_source IS NULL);

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_condition_channel_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_condition_channel_check
  CHECK (
    condition NOT IN ('preloved', 'preowned_defect', 'open_box')
    OR commerce_channel = 'bazaar'
  );

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_market_id_slug_key;

DROP INDEX IF EXISTS public.canonical_variants_market_id_slug_key;

CREATE UNIQUE INDEX canonical_variants_market_id_slug_key
  ON public.canonical_variants (market_id, commerce_channel, slug);

DROP INDEX IF EXISTS public.canonical_variants_gtin_unique;

CREATE UNIQUE INDEX canonical_variants_gtin_unique
  ON public.canonical_variants (market_id, gtin)
  WHERE gtin IS NOT NULL AND commerce_channel = 'normal';

CREATE INDEX IF NOT EXISTS canonical_variants_channel_category_idx
  ON public.canonical_variants (market_id, commerce_channel, category_id, active)
  WHERE suppressed = false;

CREATE INDEX IF NOT EXISTS canonical_variants_bazaar_discovery_idx
  ON public.canonical_variants (commerce_channel, active, updated_at DESC)
  WHERE suppressed = false AND commerce_channel = 'bazaar';

COMMENT ON COLUMN public.canonical_variants.commerce_channel IS
  'Discovery/sales channel. normal variants belong to the standard location-aware catalogue; bazaar variants are isolated and Greece-wide.';

COMMENT ON COLUMN public.canonical_variants.bazaar_source IS
  'Optional provenance for BAZAAR inventory, e.g. supplier_preloved, supplier_preowned_defect, customer_return, open_box, display_stock, damaged_packaging.';

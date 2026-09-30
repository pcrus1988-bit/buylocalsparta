-- Backfill the live dropship-family projection table into the immutable schema history.
-- Production already has this table; CREATE ... IF NOT EXISTS makes this a no-op there
-- while allowing fresh databases to reach later projection migrations reproducibly.

CREATE TABLE IF NOT EXISTS bls_private.storefront_dropship_live_family (
  supplier_id uuid NOT NULL,
  external_product_id text NOT NULL,
  sellable boolean NOT NULL DEFAULT false,
  available_until timestamptz NOT NULL,
  newest_at timestamptz NOT NULL DEFAULT now(),
  min_price_minor bigint,
  max_msrp_minor bigint,
  category_codes text[] NOT NULL DEFAULT '{}'::text[],
  department_codes text[] NOT NULL DEFAULT '{}'::text[],
  brand_names text[] NOT NULL DEFAULT '{}'::text[],
  brand_names_normalized text[] NOT NULL DEFAULT '{}'::text[],
  colors text[] NOT NULL DEFAULT '{}'::text[],
  sizes text[] NOT NULL DEFAULT '{}'::text[],
  sizes_text text NOT NULL DEFAULT '[]'::text,
  fits text[] NOT NULL DEFAULT '{}'::text[],
  materials text[] NOT NULL DEFAULT '{}'::text[],
  sort_title text NOT NULL DEFAULT ''::text,
  search_vector tsvector NOT NULL DEFAULT ''::tsvector,
  projected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefront_dropship_live_family_pkey
    PRIMARY KEY (supplier_id, external_product_id)
);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_available_idx
  ON bls_private.storefront_dropship_live_family
    (supplier_id, sellable, available_until DESC, newest_at DESC, external_product_id);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_price_idx
  ON bls_private.storefront_dropship_live_family
    (supplier_id, min_price_minor, external_product_id)
  WHERE sellable = true;

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_categories_gin
  ON bls_private.storefront_dropship_live_family USING gin (category_codes);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_departments_gin
  ON bls_private.storefront_dropship_live_family USING gin (department_codes);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_brands_gin
  ON bls_private.storefront_dropship_live_family USING gin (brand_names_normalized);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_colors_gin
  ON bls_private.storefront_dropship_live_family USING gin (colors);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_sizes_gin
  ON bls_private.storefront_dropship_live_family USING gin (sizes);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_fits_gin
  ON bls_private.storefront_dropship_live_family USING gin (fits);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_materials_gin
  ON bls_private.storefront_dropship_live_family USING gin (materials);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_search_gin
  ON bls_private.storefront_dropship_live_family USING gin (search_vector);

COMMENT ON TABLE bls_private.storefront_dropship_live_family IS
  'Incremental supplier-family projection used for fast, fail-closed dropship storefront reads.';

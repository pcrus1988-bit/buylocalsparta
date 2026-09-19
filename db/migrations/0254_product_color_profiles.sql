-- KONTA MOY — persistent product colour profiles for COLOR FINDER.
-- Brand shade identity remains separate from normalized matching attributes.
-- Approximate canonical colours are explicitly marked and never presented as
-- manufacturer-provided exact swatches.

BEGIN;

CREATE TABLE public.product_color_profiles (
  canonical_variant_id uuid PRIMARY KEY
    REFERENCES public.canonical_variants(id) ON DELETE CASCADE,
  family_id uuid REFERENCES public.product_families(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.dropship_suppliers(id) ON DELETE SET NULL,
  external_product_id text,

  brand_name text,
  shade_code text,
  brand_shade_name text,
  color_family text,
  color_detail text,
  undertone text,
  finish text,
  product_type text,

  canonical_hex text,
  lab_l double precision,
  lab_a double precision,
  lab_b double precision,
  match_precision text NOT NULL DEFAULT 'unknown'
    CHECK (match_precision IN ('exact','canonicalized','family_estimate','unknown')),
  confidence numeric(5,4) NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  source_kind text NOT NULL DEFAULT 'derived'
    CHECK (source_kind IN ('supplier','agent','research','derived')),
  source_hash text NOT NULL
    CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provenance)='object'),

  profiled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_color_profiles_external_product_nonempty
    CHECK (external_product_id IS NULL OR length(btrim(external_product_id)) > 0),
  CONSTRAINT product_color_profiles_hex_format
    CHECK (canonical_hex IS NULL OR canonical_hex ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT product_color_profiles_lab_complete
    CHECK (
      (canonical_hex IS NULL AND lab_l IS NULL AND lab_a IS NULL AND lab_b IS NULL)
      OR
      (canonical_hex IS NOT NULL AND lab_l IS NOT NULL AND lab_a IS NOT NULL AND lab_b IS NOT NULL)
    )
);

CREATE INDEX product_color_profiles_supplier_external_idx
  ON public.product_color_profiles(supplier_id,external_product_id)
  WHERE supplier_id IS NOT NULL AND external_product_id IS NOT NULL;

CREATE INDEX product_color_profiles_filter_idx
  ON public.product_color_profiles(product_type,color_family,finish)
  WHERE canonical_hex IS NOT NULL;

CREATE INDEX product_color_profiles_profiled_idx
  ON public.product_color_profiles(profiled_at);

COMMENT ON TABLE public.product_color_profiles IS
  'Canonical colour intelligence for discovery tools. Exact brand shade identity, normalized colour family and perceptual matching data are stored separately with provenance/confidence.';
COMMENT ON COLUMN public.product_color_profiles.brand_shade_name IS
  'Manufacturer/brand shade name when supported by source evidence. Never replaced by the normalized KONTA MOY colour family.';
COMMENT ON COLUMN public.product_color_profiles.shade_code IS
  'Manufacturer shade code when supported by supplier/brand evidence; presentation identity only, not a supplier product ID.';
COMMENT ON COLUMN public.product_color_profiles.canonical_hex IS
  'Matching colour. Exact only when match_precision=exact; canonicalized/family_estimate values are approximate discovery colours.';
COMMENT ON COLUMN public.product_color_profiles.provenance IS
  'Evidence summary for shade identity, normalized colour and swatch precision. Internal supplier secrets must never be stored here.';

ALTER TABLE public.product_color_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.product_color_profiles
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

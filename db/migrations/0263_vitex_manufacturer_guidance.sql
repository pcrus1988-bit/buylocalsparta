-- KONTA MOY — source-backed manufacturer technical guidance foundation.
--
-- Manufacturer documentation and KONTA MOY project guidance are deliberately
-- separated. Customer-facing reads must expose only verified/current
-- manufacturer rows when labelling content as manufacturer instructions.

BEGIN;

CREATE TABLE public.manufacturer_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer text NOT NULL DEFAULT 'Vitex',
  manufacturer_key text NOT NULL,
  brand_name text NOT NULL DEFAULT 'Vitex',
  product_name text NOT NULL,
  product_family text,
  official_product_code text,
  ean_gtin text,
  official_url text,
  tds_url text,
  sds_url text,
  catalogue_url text,
  product_category text,
  subcategory text,
  interior_exterior text CHECK (interior_exterior IS NULL OR interior_exterior IN ('interior','exterior','both','system','unknown')),
  substrate_types text[] NOT NULL DEFAULT '{}'::text[],
  finish text,
  available_bases text[] NOT NULL DEFAULT '{}'::text[],
  tintable boolean,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(certifications)='array'),
  product_system_status text NOT NULL DEFAULT 'current' CHECK (product_system_status IN ('current','legacy','discontinued','unknown')),
  verification_status text NOT NULL DEFAULT 'discovered' CHECK (verification_status IN ('discovered','partially_extracted','needs_review','verified','superseded')),
  canonical_product_family_id uuid REFERENCES public.product_families(id) ON DELETE SET NULL,
  canonical_variant_id uuid REFERENCES public.canonical_variants(id) ON DELETE SET NULL,
  valid_from date,
  valid_to date,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer, manufacturer_key),
  CHECK (length(btrim(manufacturer_key)) > 0),
  CHECK (length(btrim(product_name)) > 0),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE INDEX manufacturer_products_status_idx
  ON public.manufacturer_products(manufacturer,verification_status,product_category);
CREATE INDEX manufacturer_products_canonical_family_idx
  ON public.manufacturer_products(canonical_product_family_id)
  WHERE canonical_product_family_id IS NOT NULL;
CREATE INDEX manufacturer_products_canonical_variant_idx
  ON public.manufacturer_products(canonical_variant_id)
  WHERE canonical_variant_id IS NOT NULL;

CREATE TABLE public.manufacturer_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  variant_key text NOT NULL,
  official_sku text,
  ean_gtin text,
  base_name text,
  finish text,
  colour_name text,
  colour_code text,
  canonical_variant_id uuid REFERENCES public.canonical_variants(id) ON DELETE SET NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes)='object'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,variant_key),
  CHECK (length(btrim(variant_key)) > 0)
);

CREATE INDEX manufacturer_product_variants_canonical_idx
  ON public.manufacturer_product_variants(canonical_variant_id)
  WHERE canonical_variant_id IS NOT NULL;

CREATE TABLE public.manufacturer_technical_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer text NOT NULL DEFAULT 'Vitex',
  product_id uuid REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('product_page','tds','sds','catalogue','system_guide','application_guide','dop','ebusiness','other_official')),
  source_title text NOT NULL,
  source_url text NOT NULL,
  document_revision text,
  publication_date date,
  language text NOT NULL DEFAULT 'el',
  page_count integer CHECK (page_count IS NULL OR page_count > 0),
  section_heading text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  content_type text,
  valid_from date,
  valid_to date,
  is_current boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES public.manufacturer_technical_sources(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(source_title)) > 0),
  CHECK (length(btrim(source_url)) > 0),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX manufacturer_technical_sources_identity_uidx
  ON public.manufacturer_technical_sources(
    manufacturer,
    source_url,
    COALESCE(document_revision,''),
    COALESCE(checksum_sha256,'')
  );
CREATE INDEX manufacturer_technical_sources_product_idx
  ON public.manufacturer_technical_sources(product_id,is_current,source_type);

CREATE TABLE public.manufacturer_instruction_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.manufacturer_technical_sources(id) ON DELETE CASCADE,
  source_layer text NOT NULL DEFAULT 'manufacturer' CHECK (source_layer IN ('manufacturer','konta_mou_rule')),
  field_name text NOT NULL,
  rule_key text,
  normalized_value jsonb NOT NULL DEFAULT 'null'::jsonb,
  source_page integer CHECK (source_page IS NULL OR source_page >= 1),
  section_heading text,
  exact_excerpt text NOT NULL,
  confidence numeric(5,4) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_fingerprint text NOT NULL UNIQUE CHECK (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  valid_from date,
  valid_to date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(field_name)) > 0),
  CHECK (length(btrim(exact_excerpt)) > 0),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE INDEX manufacturer_instruction_evidence_product_idx
  ON public.manufacturer_instruction_evidence(product_id,field_name,is_current);
CREATE INDEX manufacturer_instruction_evidence_source_idx
  ON public.manufacturer_instruction_evidence(source_id);

CREATE TABLE public.manufacturer_application_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  source_layer text NOT NULL DEFAULT 'manufacturer' CHECK (source_layer IN ('manufacturer','konta_mou_rule')),
  verification_status text NOT NULL DEFAULT 'needs_review' CHECK (verification_status IN ('partially_extracted','needs_review','verified','superseded')),
  profile_revision text NOT NULL,
  primary_source_id uuid REFERENCES public.manufacturer_technical_sources(id) ON DELETE SET NULL,
  surface_types text[] NOT NULL DEFAULT '{}'::text[],
  substrates text[] NOT NULL DEFAULT '{}'::text[],
  suitable_for text[] NOT NULL DEFAULT '{}'::text[],
  not_suitable_for text[] NOT NULL DEFAULT '{}'::text[],
  interior_exterior text CHECK (interior_exterior IS NULL OR interior_exterior IN ('interior','exterior','both','system','unknown')),
  surface_condition_required text,
  surface_preparation text[] NOT NULL DEFAULT '{}'::text[],
  cleaning_before_application text[] NOT NULL DEFAULT '{}'::text[],
  repair_requirements text[] NOT NULL DEFAULT '{}'::text[],
  moisture_requirements text,
  primer_required boolean,
  recommended_primers text[] NOT NULL DEFAULT '{}'::text[],
  compatible_primers text[] NOT NULL DEFAULT '{}'::text[],
  required_system_components text[] NOT NULL DEFAULT '{}'::text[],
  incompatible_products_or_systems text[] NOT NULL DEFAULT '{}'::text[],
  mixing_instructions text[] NOT NULL DEFAULT '{}'::text[],
  dilution_required boolean,
  dilution_percent_min numeric(7,3),
  dilution_percent_max numeric(7,3),
  dilution_material text,
  application_methods text[] NOT NULL DEFAULT '{}'::text[],
  recommended_roller text,
  recommended_brush text,
  spray_requirements text,
  number_of_coats_min integer,
  number_of_coats_max integer,
  coverage_m2_per_litre_min numeric(10,3),
  coverage_m2_per_litre_max numeric(10,3),
  coverage_conditions text,
  consumption_value_min numeric(12,4),
  consumption_value_max numeric(12,4),
  consumption_unit text,
  dry_to_touch_minutes_min integer,
  dry_to_touch_minutes_max integer,
  recoat_minutes_min integer,
  recoat_minutes_max integer,
  full_cure_minutes_min integer,
  full_cure_minutes_max integer,
  minimum_application_temperature_c numeric(6,2),
  maximum_application_temperature_c numeric(6,2),
  maximum_relative_humidity_percent numeric(6,2),
  weather_restrictions text[] NOT NULL DEFAULT '{}'::text[],
  direct_sun_restrictions text,
  rain_restrictions text,
  dew_or_condensation_restrictions text,
  substrate_temperature_requirements text,
  tool_cleaning text[] NOT NULL DEFAULT '{}'::text[],
  storage_conditions text,
  shelf_life text,
  voc_information text,
  ppe_requirements text[] NOT NULL DEFAULT '{}'::text[],
  safety_warnings text[] NOT NULL DEFAULT '{}'::text[],
  special_application_notes text[] NOT NULL DEFAULT '{}'::text[],
  manufacturer_do_not_do text[] NOT NULL DEFAULT '{}'::text[],
  valid_from date,
  valid_to date,
  last_verified_at timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,source_layer,profile_revision),
  CHECK (dilution_percent_min IS NULL OR dilution_percent_min >= 0),
  CHECK (dilution_percent_max IS NULL OR dilution_percent_max >= 0),
  CHECK (dilution_percent_min IS NULL OR dilution_percent_max IS NULL OR dilution_percent_max >= dilution_percent_min),
  CHECK (number_of_coats_min IS NULL OR number_of_coats_min > 0),
  CHECK (number_of_coats_max IS NULL OR number_of_coats_max > 0),
  CHECK (number_of_coats_min IS NULL OR number_of_coats_max IS NULL OR number_of_coats_max >= number_of_coats_min),
  CHECK (coverage_m2_per_litre_min IS NULL OR coverage_m2_per_litre_min > 0),
  CHECK (coverage_m2_per_litre_max IS NULL OR coverage_m2_per_litre_max > 0),
  CHECK (coverage_m2_per_litre_min IS NULL OR coverage_m2_per_litre_max IS NULL OR coverage_m2_per_litre_max >= coverage_m2_per_litre_min),
  CHECK (maximum_relative_humidity_percent IS NULL OR (maximum_relative_humidity_percent >= 0 AND maximum_relative_humidity_percent <= 100)),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX manufacturer_application_profiles_current_uidx
  ON public.manufacturer_application_profiles(product_id,source_layer)
  WHERE is_current = true AND verification_status <> 'superseded';

CREATE TABLE public.manufacturer_surface_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  surface_type text NOT NULL,
  eligibility text NOT NULL CHECK (eligibility IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component','not_recommended','blocked')),
  conditions text,
  source_evidence_id uuid NOT NULL REFERENCES public.manufacturer_instruction_evidence(id) ON DELETE RESTRICT,
  valid_from date,
  valid_to date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,surface_type,source_evidence_id),
  CHECK (length(btrim(surface_type)) > 0)
);

CREATE TABLE public.manufacturer_product_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  target_product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  relationship_strength text NOT NULL CHECK (relationship_strength IN ('required','recommended','allowed','prohibited')),
  conditions text,
  system_key text,
  source_evidence_id uuid NOT NULL REFERENCES public.manufacturer_instruction_evidence(id) ON DELETE RESTRICT,
  valid_from date,
  valid_to date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_product_id <> target_product_id),
  UNIQUE (source_product_id,target_product_id,relationship_type,source_evidence_id)
);

CREATE INDEX manufacturer_product_compatibility_source_idx
  ON public.manufacturer_product_compatibility(source_product_id,is_current);
CREATE INDEX manufacturer_product_compatibility_target_idx
  ON public.manufacturer_product_compatibility(target_product_id,is_current);

CREATE TABLE public.manufacturer_application_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  source_layer text NOT NULL DEFAULT 'manufacturer' CHECK (source_layer IN ('manufacturer','konta_mou_rule')),
  rule_revision text NOT NULL,
  condition_expression jsonb NOT NULL CHECK (jsonb_typeof(condition_expression)='object'),
  result_status text NOT NULL CHECK (result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component','not_recommended','blocked')),
  actions jsonb NOT NULL CHECK (jsonb_typeof(actions)='object'),
  priority integer NOT NULL DEFAULT 100,
  source_evidence_id uuid REFERENCES public.manufacturer_instruction_evidence(id) ON DELETE RESTRICT,
  valid_from date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,rule_key,source_layer,rule_revision),
  CHECK (source_layer <> 'manufacturer' OR source_evidence_id IS NOT NULL)
);

CREATE INDEX manufacturer_application_rules_runtime_idx
  ON public.manufacturer_application_rules(product_id,source_layer,active,priority);

CREATE TABLE public.manufacturer_package_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.manufacturer_product_variants(id) ON DELETE CASCADE,
  amount numeric(12,4) NOT NULL CHECK (amount > 0),
  unit text NOT NULL,
  package_label text,
  source_evidence_id uuid REFERENCES public.manufacturer_instruction_evidence(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,variant_id,amount,unit)
);

CREATE TABLE public.manufacturer_colour_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer text NOT NULL DEFAULT 'Vitex',
  system_key text NOT NULL,
  system_name text NOT NULL,
  official_url text,
  notes text,
  source_id uuid REFERENCES public.manufacturer_technical_sources(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer,system_key)
);

CREATE TABLE public.manufacturer_product_colour_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  colour_system_id uuid NOT NULL REFERENCES public.manufacturer_colour_systems(id) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT true,
  base_requirements text,
  colour_source text NOT NULL DEFAULT 'manufacturer' CHECK (colour_source IN ('manufacturer','derived')),
  source_evidence_id uuid REFERENCES public.manufacturer_instruction_evidence(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id,colour_system_id,colour_source),
  CHECK (colour_source <> 'manufacturer' OR source_evidence_id IS NOT NULL)
);

CREATE TABLE public.manufacturer_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer text NOT NULL DEFAULT 'Vitex',
  system_key text NOT NULL,
  system_name text NOT NULL,
  system_category text NOT NULL,
  verification_status text NOT NULL DEFAULT 'discovered' CHECK (verification_status IN ('discovered','partially_extracted','needs_review','verified','superseded')),
  primary_source_id uuid REFERENCES public.manufacturer_technical_sources(id) ON DELETE SET NULL,
  valid_from date,
  valid_to date,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manufacturer,system_key)
);

CREATE TABLE public.manufacturer_system_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.manufacturer_systems(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.manufacturer_products(id) ON DELETE CASCADE,
  component_role text NOT NULL,
  sequence_no integer CHECK (sequence_no IS NULL OR sequence_no > 0),
  requirement text NOT NULL CHECK (requirement IN ('required','recommended','allowed','conditional')),
  conditions text,
  source_evidence_id uuid NOT NULL REFERENCES public.manufacturer_instruction_evidence(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (system_id,product_id,component_role,source_evidence_id)
);

ALTER TABLE public.manufacturer_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_technical_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_instruction_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_application_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_surface_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_product_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_application_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_package_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_colour_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_product_colour_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturer_system_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.manufacturer_products FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_product_variants FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_technical_sources FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_instruction_evidence FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_application_profiles FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_surface_compatibility FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_product_compatibility FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_application_rules FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_package_sizes FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_colour_systems FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_product_colour_compatibility FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_systems FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.manufacturer_system_components FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMENT ON TABLE public.manufacturer_products IS 'Manufacturer-owned product identity layer. It links to canonical catalogue identity only when a real match exists; it never creates a duplicate canonical product by itself.';
COMMENT ON TABLE public.manufacturer_technical_sources IS 'Versioned official manufacturer source registry. PDF checksum is stored when the exact binary was successfully downloaded.';
COMMENT ON TABLE public.manufacturer_instruction_evidence IS 'Field/rule-level audit evidence. Short excerpts only; source_layer prevents KONTA MOY guidance from being represented as manufacturer instructions.';
COMMENT ON TABLE public.manufacturer_application_profiles IS 'Structured application instructions. Customer-facing manufacturer guidance must use only current rows where source_layer=manufacturer and verification_status=verified.';
COMMENT ON COLUMN public.manufacturer_application_profiles.coverage_m2_per_litre_min IS 'Manufacturer theoretical coverage when explicitly published; never a guaranteed real-world consumption.';
COMMENT ON COLUMN public.manufacturer_product_colour_compatibility.colour_source IS 'manufacturer for officially supported colour systems; derived for KONTA MOY-created digital colour values.';

COMMIT;

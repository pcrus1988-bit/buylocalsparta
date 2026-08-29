-- Buy Local Sparta — Open Icecat Greek-first product intelligence.
-- Keeps Open Icecat as provenance-bearing source evidence and prevents non-Greek
-- customer-facing content from becoming publishable through the source pipeline.

BEGIN;

ALTER TABLE public.catalog_sources
  DROP CONSTRAINT IF EXISTS catalog_sources_source_kind_check;

ALTER TABLE public.catalog_sources
  ADD CONSTRAINT catalog_sources_source_kind_check
  CHECK (source_kind IN ('supplier','manufacturer','distributor','vendor','data_provider','other'));

COMMENT ON COLUMN public.catalog_sources.source_kind IS
  'Source role. data_provider covers governed catalogue providers such as Open Icecat; provider data remains evidence, never automatic commerce truth.';

CREATE TABLE public.catalog_source_product_localizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES public.catalog_source_products(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'EL',
  source_locale text,
  title text NOT NULL,
  product_name text,
  description text,
  category_label text,
  specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_terms text[] NOT NULL DEFAULT ARRAY[]::text[],
  field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_origin text NOT NULL
    CHECK (content_origin IN ('icecat_native','translated_verified','mixed','manual_verified')),
  localizer_version text,
  greek_completeness numeric(6,5) NOT NULL DEFAULT 0
    CHECK (greek_completeness >= 0 AND greek_completeness <= 1),
  quality_status text NOT NULL DEFAULT 'needs_enrichment'
    CHECK (quality_status IN ('needs_enrichment','ready','verified','rejected')),
  quality_missing text[] NOT NULL DEFAULT ARRAY[]::text[],
  publish_eligible boolean GENERATED ALWAYS AS (
    locale='EL'
    AND greek_completeness >= 0.90000
    AND quality_status IN ('ready','verified')
  ) STORED,
  verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_product_id, locale),
  CHECK (length(btrim(locale)) > 0),
  CHECK (length(btrim(title)) > 0),
  CHECK (source_locale IS NULL OR length(btrim(source_locale)) > 0),
  CHECK (localizer_version IS NULL OR length(btrim(localizer_version)) > 0),
  CHECK (jsonb_typeof(specifications)='array'),
  CHECK (jsonb_typeof(field_provenance)='object'),
  CHECK (
    quality_status <> 'verified'
    OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE INDEX catalog_source_product_localizations_quality_idx
  ON public.catalog_source_product_localizations(locale,quality_status,greek_completeness DESC);

CREATE INDEX catalog_source_product_localizations_publish_idx
  ON public.catalog_source_product_localizations(source_product_id)
  WHERE publish_eligible=true;

COMMENT ON TABLE public.catalog_source_product_localizations IS
  'Locale-specific source-product content with field-level provenance. Open Icecat EL content is preferred; verified translation may fill gaps, but identifiers/spec facts must remain source-derived.';
COMMENT ON COLUMN public.catalog_source_product_localizations.field_provenance IS
  'Per-field evidence such as ICECAT_NATIVE_EL or TRANSLATED_VERIFIED. It must describe derivation, not replace immutable raw source payloads.';
COMMENT ON COLUMN public.catalog_source_product_localizations.publish_eligible IS
  'Source-level Greek quality gate only. Canonical publication still requires the existing governed source-to-canonical workflow and commerce activation rules.';

ALTER TABLE public.catalog_source_product_localizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalog_source_product_localizations
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.catalog_source_product_localizations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.catalog_source_product_localizations TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.guard_catalog_source_product_localization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  NEW.locale := upper(btrim(NEW.locale));
  NEW.source_locale := NULLIF(upper(btrim(NEW.source_locale)),'');
  NEW.title := btrim(NEW.title);
  NEW.product_name := NULLIF(btrim(NEW.product_name),'');
  NEW.description := NULLIF(btrim(NEW.description),'');
  NEW.category_label := NULLIF(btrim(NEW.category_label),'');
  NEW.localizer_version := NULLIF(btrim(NEW.localizer_version),'');
  NEW.updated_at := now();

  IF NEW.locale='EL' AND NEW.quality_status IN ('ready','verified') THEN
    IF NEW.greek_completeness < 0.90000 THEN
      RAISE EXCEPTION 'Greek product localization cannot be ready below 90%% completeness';
    END IF;
    IF NEW.description IS NULL OR NEW.category_label IS NULL OR jsonb_array_length(NEW.specifications)=0 THEN
      RAISE EXCEPTION 'Greek product localization requires description, category and specifications before ready';
    END IF;
    IF cardinality(NEW.quality_missing) > 0 THEN
      RAISE EXCEPTION 'Greek product localization marked ready still has missing required fields';
    END IF;
    IF NOT (NEW.field_provenance ?& ARRAY['title','description','category','specifications']) THEN
      RAISE EXCEPTION 'Greek product localization requires field provenance before ready';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_source_product_localization_guard
  BEFORE INSERT OR UPDATE ON public.catalog_source_product_localizations
  FOR EACH ROW EXECUTE FUNCTION bls_private.guard_catalog_source_product_localization();

GRANT EXECUTE ON FUNCTION bls_private.guard_catalog_source_product_localization()
  TO bls_platform_runtime;

-- Register the provider idempotently for the Sparta market when present. This is
-- configuration only; no product is imported by a migration.
INSERT INTO public.catalog_sources (
  market_id,
  code,
  name,
  source_kind,
  website,
  active,
  metadata
)
SELECT
  m.id,
  'open_icecat',
  'Open Icecat',
  'data_provider',
  'https://icecat.com/',
  true,
  jsonb_build_object(
    'preferred_locale','EL',
    'fallback_locale','EN',
    'publication_policy','greek_quality_gate',
    'transport','api_or_governed_bulk_snapshot',
    'preferred_index','https://data.icecat.biz/export/freexml/EL/files.index.csv.gz',
    'daily_index','https://data.icecat.biz/export/freexml/EL/daily.index.csv.gz',
    'attribution_required',true,
    'attribution_label','Specs Icecat',
    'attribution_url','https://icecat.biz/',
    'as_is_disclaimer_required',true,
    'asset_self_hosting_required',true,
    'ai_training_prohibited',true
  )
FROM public.markets m
WHERE m.slug='sparta'
ON CONFLICT (market_id,code) DO UPDATE
SET
  name=EXCLUDED.name,
  source_kind=EXCLUDED.source_kind,
  website=EXCLUDED.website,
  active=true,
  metadata=public.catalog_sources.metadata || EXCLUDED.metadata,
  updated_at=now();

COMMIT;

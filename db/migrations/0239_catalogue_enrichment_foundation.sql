-- KONTA MOY — catalogue enrichment foundation.
-- Derived merchandising content is keyed by supplier parent / canonical family.
-- Raw supplier evidence remains immutable in catalog_source_products and snapshots.

BEGIN;

CREATE TABLE public.catalogue_enrichments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.dropship_suppliers(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  family_id uuid REFERENCES public.product_families(id) ON DELETE SET NULL,
  source_product_id uuid REFERENCES public.catalog_source_products(id) ON DELETE SET NULL,

  verified_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  fact_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','enriched','needs_review','failed')),

  display_title_el text,
  display_short_description_el text,
  display_description_el text,
  display_title_en text,
  display_short_description_en text,
  display_description_en text,

  deterministic_fallback jsonb NOT NULL DEFAULT '{}'::jsonb,
  bazaar_overlay jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,

  enrichment_version integer NOT NULL DEFAULT 1 CHECK (enrichment_version > 0),
  prompt_version text,
  rules_version text NOT NULL DEFAULT 'catalogue-enrichment-v1',
  last_error text,
  generated_at timestamptz,
  validated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT catalogue_enrichments_source_key UNIQUE (supplier_id,external_product_id),
  CONSTRAINT catalogue_enrichments_external_product_nonempty CHECK (length(btrim(external_product_id)) > 0),
  CONSTRAINT catalogue_enrichments_source_hash CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT catalogue_enrichments_verified_facts_object CHECK (jsonb_typeof(verified_facts)='object'),
  CONSTRAINT catalogue_enrichments_fact_provenance_object CHECK (jsonb_typeof(fact_provenance)='object'),
  CONSTRAINT catalogue_enrichments_fallback_object CHECK (jsonb_typeof(deterministic_fallback)='object'),
  CONSTRAINT catalogue_enrichments_bazaar_overlay_object CHECK (jsonb_typeof(bazaar_overlay)='object'),
  CONSTRAINT catalogue_enrichments_validation_errors_array CHECK (jsonb_typeof(validation_errors)='array')
);

CREATE UNIQUE INDEX catalogue_enrichments_family_uidx
  ON public.catalogue_enrichments(family_id)
  WHERE family_id IS NOT NULL;

CREATE INDEX catalogue_enrichments_status_idx
  ON public.catalogue_enrichments(status,updated_at);

CREATE INDEX catalogue_enrichments_source_hash_idx
  ON public.catalogue_enrichments(source_hash);

COMMENT ON TABLE public.catalogue_enrichments IS
  'Derived catalogue merchandising content. Supplier payload/title/description remain source-of-truth evidence in catalog_source_products; this table never replaces them.';
COMMENT ON COLUMN public.catalogue_enrichments.verified_facts IS
  'Structured facts extracted conservatively from supplier evidence. Future language generation may use these facts but must not invent product facts.';
COMMENT ON COLUMN public.catalogue_enrichments.fact_provenance IS
  'Per-fact evidence paths showing where each verified fact came from in the normalized supplier payload.';
COMMENT ON COLUMN public.catalogue_enrichments.source_hash IS
  'Stable hash of merchandising-relevant supplier evidence. Availability/stock/price-only changes are intentionally excluded.';
COMMENT ON COLUMN public.catalogue_enrichments.deterministic_fallback IS
  'Safe non-AI presentation available when enrichment is pending, disabled or invalid.';
COMMENT ON COLUMN public.catalogue_enrichments.bazaar_overlay IS
  'Condition/channel facts layered on the canonical presentation for BAZAAR; it does not replace the canonical merchandising copy.';

ALTER TABLE public.catalogue_enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalogue_enrichments
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

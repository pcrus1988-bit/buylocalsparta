-- Applied on NYXI production as 20261019051022_nyxi_private_brand_line_shade_provenance_v1.
-- Model publisher vs actual brand separately. Discovery DOES NOT grant capture rights
-- or establish shade swatches, color codes, availability or product contents.

CREATE TABLE IF NOT EXISTS public.nyxi_nail_brand_publishers_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 publisher_key text NOT NULL UNIQUE,
 publisher_name text NOT NULL CHECK(length(trim(publisher_name)) BETWEEN 2 AND 160),
 identity_status text NOT NULL DEFAULT 'source_atlas_publisher_unresolved'
 CHECK(identity_status IN('source_atlas_publisher_unresolved','identity_review_required','verified_brand','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nyxi_nail_publisher_sources_v1 (
 publisher_id uuid NOT NULL REFERENCES public.nyxi_nail_brand_publishers_v1(id) ON DELETE RESTRICT,
 source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
 relationship text NOT NULL DEFAULT 'source_atlas_publisher'
 CHECK(relationship IN('source_atlas_publisher','official_brand_source','licensed_distributor_source')),
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','reviewed','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(publisher_id,source_id)
);
CREATE INDEX IF NOT EXISTS nyxi_nail_publisher_sources_source_idx
 ON public.nyxi_nail_publisher_sources_v1(source_id);

CREATE TABLE IF NOT EXISTS public.nyxi_nail_product_lines_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 publisher_id uuid NOT NULL REFERENCES public.nyxi_nail_brand_publishers_v1(id) ON DELETE RESTRICT,
 line_key text NOT NULL,
 line_name text NOT NULL CHECK(length(trim(line_name)) BETWEEN 2 AND 200),
 product_type text NOT NULL DEFAULT 'unclassified'
 CHECK(product_type IN('unclassified','traditional_lacquer','gel_polish','builder_gel','dip_powder','hybrid','treatment','top_base','nail_art','other')),
 review_status text NOT NULL DEFAULT 'candidate'
 CHECK(review_status IN('candidate','independent_review','verified','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(publisher_id,line_key)
);

CREATE TABLE IF NOT EXISTS public.nyxi_nail_shade_variants_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 line_id uuid NOT NULL REFERENCES public.nyxi_nail_product_lines_v1(id) ON DELETE RESTRICT,
 variant_key text NOT NULL,
 manufacturer_shade_name text NOT NULL CHECK(length(trim(manufacturer_shade_name)) BETWEEN 1 AND 200),
 manufacturer_sku text,
 shade_entity_id uuid REFERENCES public.nyxi_entities(id) ON DELETE RESTRICT,
 pack_size_ml numeric(8,3) CHECK(pack_size_ml > 0 AND pack_size_ml < 10000),
 finish text NOT NULL DEFAULT 'unclassified'
 CHECK(finish IN('unclassified','cream','sheer','jelly','matte','shimmer','glitter','holographic','chrome','magnetic','thermal','duochrome','other')),
 opacity text NOT NULL DEFAULT 'unclassified'
 CHECK(opacity IN('unclassified','sheer','semi_opaque','opaque','layer_dependent')),
 review_status text NOT NULL DEFAULT 'candidate'
 CHECK(review_status IN('candidate','independent_review','verified','rejected')),
 source_variant_url text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(line_id,variant_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS nyxi_nail_shade_variants_sku_unique
 ON public.nyxi_nail_shade_variants_v1(line_id,manufacturer_sku)
 WHERE manufacturer_sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.nyxi_nail_shade_color_links_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 variant_id uuid NOT NULL REFERENCES public.nyxi_nail_shade_variants_v1(id) ON DELETE RESTRICT,
 measurement_id uuid NOT NULL REFERENCES public.nyxi_shade_measurements(id) ON DELETE RESTRICT,
 evidence_status text NOT NULL DEFAULT 'pending'
 CHECK(evidence_status IN('pending','requires_recalibration','rejected')),
 color_use text NOT NULL DEFAULT 'approximation_not_calibrated'
 CHECK(color_use IN('approximation_not_calibrated','instrument_supported','manufacturer_claim_unverified')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(variant_id,measurement_id)
);
CREATE INDEX IF NOT EXISTS nyxi_nail_color_links_measurement_idx
 ON public.nyxi_nail_shade_color_links_v1(measurement_id);

CREATE OR REPLACE FUNCTION public.nyxi_nail_shade_color_link_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.nyxi_nail_shade_variants_v1 v
  JOIN public.nyxi_shade_measurements sm ON sm.id=NEW.measurement_id
  JOIN public.nyxi_evidence_fragments f ON f.id=sm.fragment_id
   AND f.source_id=sm.source_id AND f.snapshot_id=sm.snapshot_id
  JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id AND sn.source_id=f.source_id
  JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id AND m.source_id=sn.source_id
  JOIN public.nyxi_asset_acquisition_approvals a ON a.id::text=sn.provenance->>'asset_approval_id'
  WHERE v.id=NEW.variant_id
    AND v.shade_entity_id IS NOT NULL AND v.shade_entity_id=sm.shade_entity_id
    AND sm.derived_hex ~ '^#[0-9A-Fa-f]{6}$'
    AND sn.sha256=m.metadata->>'sha256'
    AND m.extraction_status='complete'
    AND a.acquisition_authorized AND a.expires_at>now() AND a.review_due_at>now()
    AND sm.metadata->>'review_status' IN('pending','needs_review')
 ) THEN
  RAISE EXCEPTION 'NYXI shade evidence requires the matching shade entity and exact approved archived fragment; no inferred manufacturer HEX';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.nyxi_nail_shade_color_link_guard_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nyxi_nail_shade_color_link_guard ON public.nyxi_nail_shade_color_links_v1;
CREATE TRIGGER nyxi_nail_shade_color_link_guard
 BEFORE INSERT OR UPDATE ON public.nyxi_nail_shade_color_links_v1
 FOR EACH ROW EXECUTE FUNCTION public.nyxi_nail_shade_color_link_guard_v1();

DO $$
DECLARE obj text;
BEGIN
 FOREACH obj IN ARRAY ARRAY[
 'nyxi_nail_brand_publishers_v1','nyxi_nail_publisher_sources_v1',
 'nyxi_nail_product_lines_v1','nyxi_nail_shade_variants_v1','nyxi_nail_shade_color_links_v1']
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',obj);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',obj);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',obj);
 END LOOP;
END $$;

CREATE OR REPLACE VIEW public.nyxi_private_manufacturer_shade_readiness_v1
WITH (security_invoker=true) AS
SELECT p.id publisher_id,p.publisher_key,p.publisher_name,p.identity_status,
 count(DISTINCT ps.source_id)::integer registered_manufacturer_source_records,
 count(DISTINCT ps.source_id) FILTER (WHERE EXISTS(
  SELECT 1 FROM public.nyxi_source_snapshots sn WHERE sn.source_id=ps.source_id))::integer archived_manufacturer_sources,
 count(DISTINCT l.id)::integer product_lines,
 count(DISTINCT v.id)::integer named_shade_variants,
 count(DISTINCT c.measurement_id)::integer linked_shade_color_observations,
 bool_or(ps.review_status='reviewed') AS any_source_mapping_reviewed
FROM public.nyxi_nail_brand_publishers_v1 p
LEFT JOIN public.nyxi_nail_publisher_sources_v1 ps ON ps.publisher_id=p.id
LEFT JOIN public.nyxi_nail_product_lines_v1 l ON l.publisher_id=p.id
LEFT JOIN public.nyxi_nail_shade_variants_v1 v ON v.line_id=l.id
LEFT JOIN public.nyxi_nail_shade_color_links_v1 c ON c.variant_id=v.id
GROUP BY p.id,p.publisher_key,p.publisher_name,p.identity_status;
REVOKE ALL ON public.nyxi_private_manufacturer_shade_readiness_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_manufacturer_shade_readiness_v1 TO service_role;

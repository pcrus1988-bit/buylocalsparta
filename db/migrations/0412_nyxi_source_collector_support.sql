-- NYXI Phase 0 source collector support.
-- Adds lease-safe crawling state, a candidate-source ledger, and additional
-- verified official nail-industry sources. No product/formula interpretation
-- or safety classification is performed by this migration.

BEGIN;

ALTER TABLE public.nyxi_source_crawl_state
  ADD COLUMN lease_owner text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN last_success_at timestamptz,
  ADD COLUMN last_change_at timestamptz;

CREATE INDEX nyxi_source_crawl_claim_idx
  ON public.nyxi_source_crawl_state(next_check_at,lease_expires_at)
  WHERE next_check_at IS NOT NULL;

CREATE TABLE public.nyxi_source_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url text NOT NULL UNIQUE CHECK (canonical_url ~ '^https://'),
  discovered_from_source_id uuid REFERENCES public.nyxi_sources(id) ON DELETE SET NULL,
  discovery_method text NOT NULL CHECK (discovery_method IN (
    'manual',
    'official_link',
    'sitemap',
    'robots',
    'redirect',
    'regulator_index',
    'manufacturer_index',
    'search'
  )),
  publisher_hint text,
  title_hint text,
  source_family_hint text,
  jurisdiction_hint text,
  candidate_status text NOT NULL DEFAULT 'candidate'
    CHECK (candidate_status IN ('candidate','verified','rejected','duplicate','unreachable')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_source_candidates_review_idx
  ON public.nyxi_source_candidates(candidate_status,last_seen_at DESC)
  WHERE candidate_status='candidate';

ALTER TABLE public.nyxi_source_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_nyxi_source_candidates_runtime_all ON public.nyxi_source_candidates
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.nyxi_source_candidates
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nyxi_source_candidates
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.nyxi_source_candidates IS
  'Uninterpreted source-discovery ledger. Discovery does not imply authority, correctness, product identity or safety status.';

INSERT INTO public.nyxi_sources(
  source_key,publisher,title,source_family,authority_level,jurisdiction,language,
  canonical_url,retrieval_method,official,legally_binding,regulatory,
  manufacturer_primary,source_status,update_frequency,coverage,metadata,last_verified_at
) VALUES
(
  'cnd_sds','Creative Nail Design','Safety Data Sheets (SDS)',
  'manufacturer_sds',4,'GLOBAL','en','https://www.cnd.com/pages/sds',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"CND","includes":["SHELLAC","VINYLUX","PLEXIGEL","BRISA","treatments"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","preserveLinkedPdfs":true}'::jsonb,now()
),
(
  'cnd_product_profiles','Creative Nail Design','Product Profiles',
  'manufacturer_catalogue',4,'GLOBAL','en','https://www.cnd.com/pages/product-profiles',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"CND","includes":["technical_product_profiles","linked_pdfs"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","preserveLinkedPdfs":true}'::jsonb,now()
),
(
  'cnd_shellac_colours','Creative Nail Design','CND SHELLAC Color Collection',
  'manufacturer_catalogue',4,'GLOBAL','en','https://www.cnd.com/collections/cnd%E2%84%A2-shellac%E2%84%A2-color-shades',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"CND","line":"SHELLAC","scope":"colour_collection"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,now()
),
(
  'kokoist_sds','KOKOIST USA','Safety Data Sheets',
  'manufacturer_sds',4,'US','en','https://kokoistusa.com/pages/sds',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"KOKOIST","includes":["base","top","colour_gel","builder","magnetic"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","preserveLinkedPdfs":true,"historicalFormulaNote":"Manufacturer states prior product/formula SDS can be requested separately."}'::jsonb,now()
),
(
  'indigo_sds','Indigo Nails','Safety Data Sheets',
  'manufacturer_sds',4,'EU','en','https://www.indigo-nails.com/uk-en/safety-data-sheets',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"Indigo Nails","scope":"safety_data_sheets"}'::jsonb,
  '{"discoveryDate":"2026-10-04","preserveLinkedPdfs":true}'::jsonb,now()
),
(
  'light_elegance_sds','Light Elegance','SDS Downloads',
  'manufacturer_sds',4,'US','en','https://lightelegance.com/pages/sds',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"Light Elegance","includes":["colour_gel","gel_polish","builder","bases","tops","acrylic"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","preserveLinkedPdfs":true}'::jsonb,now()
),
(
  'akzentz_products','Akzentz','Products',
  'manufacturer_catalogue',4,'GLOBAL','en','https://akzentz.com/products/',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"Akzentz","scope":"product_index"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,now()
),
(
  'akzentz_luxio_collections','Akzentz','Luxio Collections',
  'manufacturer_catalogue',4,'GLOBAL','en','https://akzentz.com/collections/luxio%C2%A9-collections',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"Akzentz / Luxio","line":"Luxio","scope":"colour_collections"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,now()
),
(
  'akzentz_luxio_build_sds_eu_2025','Akzentz','Luxio Build SDS EU',
  'manufacturer_sds',4,'EU','en','https://akzentz.com/wp-content/uploads/2025/08/Luxio-Build-SDS-EU.pdf',
  'pdf',true,false,false,true,'verified','event_driven',
  '{"brand":"Akzentz / Luxio","product":"Luxio Build","market":"EU"}'::jsonb,
  '{"discoveryDate":"2026-10-04","rawDocumentPriority":"high"}'::jsonb,now()
),
(
  'akzentz_luxio_base_hema_free_sds_2024','Akzentz','Luxio Base HEMA-free SDS',
  'manufacturer_sds',4,'GLOBAL','en','https://akzentz.com/wp-content/uploads/2025/06/Luxio-Base-HEMA-free-SDS.pdf',
  'pdf',true,false,false,true,'verified','event_driven',
  '{"brand":"Akzentz / Luxio","product":"Luxio Base","document_variant":"HEMA-free"}'::jsonb,
  '{"discoveryDate":"2026-10-04","rawDocumentPriority":"high"}'::jsonb,now()
),
(
  'akzentz_luxio_base_sds_eu_2025','Akzentz','Luxio Base SDS EU',
  'manufacturer_sds',4,'EU','en','https://akzentz.com/wp-content/uploads/2025/08/Luxio-Base-SDS-EU.pdf',
  'pdf',true,false,false,true,'verified','event_driven',
  '{"brand":"Akzentz / Luxio","product":"Luxio Base","market":"EU"}'::jsonb,
  '{"discoveryDate":"2026-10-04","rawDocumentPriority":"high"}'::jsonb,now()
)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.nyxi_source_crawl_state(source_id,next_check_at)
SELECT id,now()
FROM public.nyxi_sources
WHERE source_status='verified'
ON CONFLICT (source_id) DO NOTHING;

INSERT INTO public.nyxi_source_target_links(source_id,target_id,relation)
SELECT s.id,t.id,'primary_for'
FROM public.nyxi_sources s
JOIN public.nyxi_research_targets t
  ON t.target_type='brand'
 AND (
   (s.source_key LIKE 'cnd_%' AND t.display_name='CND') OR
   (s.source_key='kokoist_sds' AND t.display_name='KOKOIST') OR
   (s.source_key='indigo_sds' AND t.display_name='Indigo Nails') OR
   (s.source_key='light_elegance_sds' AND t.display_name='Light Elegance') OR
   (s.source_key LIKE 'akzentz_%' AND t.display_name='Akzentz / Luxio')
 )
ON CONFLICT DO NOTHING;

UPDATE public.nyxi_research_targets
SET research_status='in_progress',updated_at=now()
WHERE target_type='brand'
  AND display_name IN ('CND','KOKOIST','Indigo Nails','Light Elegance','Akzentz / Luxio')
  AND research_status='queued';

COMMIT;

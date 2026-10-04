-- NYXI — Phase 0 Source Atlas.
-- Establishes an independent, versioned evidence-source registry for nail-product,
-- formula, regulatory, recall and scientific research. This layer deliberately does
-- not classify products or ingredients; it records where evidence comes from,
-- how authoritative it is, what jurisdiction it applies to and how changes can be
-- snapshotted later.
--
-- Initial official-source discovery performed 2026-10-04.

BEGIN;

CREATE TABLE public.nyxi_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE
    CHECK (source_key ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  publisher text NOT NULL CHECK (length(btrim(publisher)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  source_family text NOT NULL CHECK (source_family IN (
    'law',
    'regulatory_database',
    'scientific_opinion_index',
    'chemical_hazard_registry',
    'recall_system',
    'regulatory_guidance',
    'manufacturer_root',
    'manufacturer_product',
    'manufacturer_sds',
    'manufacturer_catalogue',
    'authorised_distributor',
    'retailer',
    'scientific_literature',
    'historical_archive'
  )),
  authority_level smallint NOT NULL CHECK (authority_level BETWEEN 1 AND 5),
  jurisdiction text NOT NULL DEFAULT 'GLOBAL'
    CHECK (length(btrim(jurisdiction)) BETWEEN 2 AND 32),
  language text NOT NULL DEFAULT 'en'
    CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  canonical_url text NOT NULL UNIQUE
    CHECK (canonical_url ~ '^https://'),
  retrieval_method text NOT NULL DEFAULT 'html'
    CHECK (retrieval_method IN ('html','pdf','json','csv','rss','api','sitemap','manual')),
  official boolean NOT NULL DEFAULT false,
  legally_binding boolean NOT NULL DEFAULT false,
  regulatory boolean NOT NULL DEFAULT false,
  manufacturer_primary boolean NOT NULL DEFAULT false,
  source_status text NOT NULL DEFAULT 'verified'
    CHECK (source_status IN ('candidate','verified','deprecated','blocked')),
  update_frequency text NOT NULL DEFAULT 'unknown'
    CHECK (update_frequency IN ('continuous','daily','weekly','monthly','quarterly','annual','event_driven','irregular','unknown')),
  coverage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(coverage)='object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_sources_family_authority_idx
  ON public.nyxi_sources(source_family,authority_level DESC,source_status)
  WHERE source_status='verified';

CREATE INDEX nyxi_sources_jurisdiction_idx
  ON public.nyxi_sources(jurisdiction,regulatory,source_status)
  WHERE source_status='verified';

CREATE TABLE public.nyxi_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE CASCADE,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  capture_kind text NOT NULL DEFAULT 'metadata'
    CHECK (capture_kind IN ('metadata','headers','excerpt','full_text','raw_file')),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_type text,
  content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  raw_object_key text,
  byte_length bigint CHECK (byte_length IS NULL OR byte_length >= 0),
  etag text,
  last_modified text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX nyxi_source_snapshots_content_unique_idx
  ON public.nyxi_source_snapshots(source_id,content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX nyxi_source_snapshots_latest_idx
  ON public.nyxi_source_snapshots(source_id,retrieved_at DESC);

CREATE TABLE public.nyxi_source_crawl_state (
  source_id uuid PRIMARY KEY REFERENCES public.nyxi_sources(id) ON DELETE CASCADE,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_http_status integer CHECK (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599),
  last_content_sha256 char(64)
    CHECK (last_content_sha256 IS NULL OR last_content_sha256 ~ '^[a-f0-9]{64}$'),
  etag text,
  last_modified text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_source_crawl_due_idx
  ON public.nyxi_source_crawl_state(next_check_at)
  WHERE next_check_at IS NOT NULL;

CREATE TABLE public.nyxi_research_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN (
    'brand',
    'jurisdiction',
    'ingredient',
    'regulation',
    'recall_system',
    'scientific_topic'
  )),
  target_key text NOT NULL CHECK (length(btrim(target_key)) > 0),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  research_status text NOT NULL DEFAULT 'queued'
    CHECK (research_status IN ('queued','in_progress','covered','needs_review','paused')),
  required_source_families text[] NOT NULL DEFAULT '{}'::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_type,target_key)
);

CREATE INDEX nyxi_research_targets_queue_idx
  ON public.nyxi_research_targets(research_status,priority DESC,created_at);

CREATE TABLE public.nyxi_source_target_links (
  source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.nyxi_research_targets(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'covers'
    CHECK (relation IN ('covers','primary_for','mentions','supersedes','historical_for')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_id,target_id,relation)
);

ALTER TABLE public.nyxi_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_crawl_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_research_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_target_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_nyxi_sources_runtime_all ON public.nyxi_sources
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_source_snapshots_runtime_all ON public.nyxi_source_snapshots
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_source_crawl_state_runtime_all ON public.nyxi_source_crawl_state
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_research_targets_runtime_all ON public.nyxi_research_targets
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_source_target_links_runtime_all ON public.nyxi_source_target_links
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE
  public.nyxi_sources,
  public.nyxi_source_snapshots,
  public.nyxi_source_crawl_state,
  public.nyxi_research_targets,
  public.nyxi_source_target_links
FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.nyxi_sources,
  public.nyxi_source_snapshots,
  public.nyxi_source_crawl_state,
  public.nyxi_research_targets,
  public.nyxi_source_target_links
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.nyxi_sources IS
  'NYXI source-of-truth registry. Records provenance and authority only; presence here does not make a product, ingredient or safety claim true.';
COMMENT ON TABLE public.nyxi_source_snapshots IS
  'Versioned capture metadata for NYXI sources. Raw bodies/files belong in object storage and are referenced by raw_object_key.';
COMMENT ON TABLE public.nyxi_source_crawl_state IS
  'Operational source-check state kept separate from immutable source snapshots.';
COMMENT ON TABLE public.nyxi_research_targets IS
  'Independent NYXI research queue. Brand targets are intentionally not foreign-keyed to the KONTA MOY commercial catalogue.';
COMMENT ON TABLE public.nyxi_source_target_links IS
  'Links evidence sources to research targets without converting source presence into extracted product or regulatory assertions.';

INSERT INTO public.nyxi_sources(
  source_key,publisher,title,source_family,authority_level,jurisdiction,language,
  canonical_url,retrieval_method,official,legally_binding,regulatory,
  manufacturer_primary,source_status,update_frequency,coverage,metadata,last_verified_at
) VALUES
(
  'eu_cosmetics_regulation_1223_2009','European Union','Regulation (EC) No 1223/2009 on cosmetic products',
  'law',5,'EU','en','https://eur-lex.europa.eu/eli/reg/2009/1223/oj','html',true,true,true,false,
  'verified','event_driven',
  '{"domain":"cosmetics","scope":"base_regulation_and_consolidated_versions"}'::jsonb,
  '{"discoveryDate":"2026-10-04","note":"EUR-Lex exposes historical consolidated versions; preserve effective dates rather than overwriting."}'::jsonb,
  now()
),
(
  'eu_regulation_2025_877','European Union','Commission Regulation (EU) 2025/877',
  'law',5,'EU','en','https://eur-lex.europa.eu/eli/reg/2025/877/oj/eng','html',true,true,true,false,
  'verified','event_driven',
  '{"domain":"cosmetics","topic":"CMR substances including TPO","effectiveDate":"2025-09-01"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'eu_cosing','European Commission','CosIng cosmetic ingredient database',
  'regulatory_database',4,'EU','en','https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en',
  'html',true,false,true,false,'verified','irregular',
  '{"domain":"ingredients","includes":["INCI","CAS","EC","historical_entries","SCCS_references"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","legalCaveat":"Informative only; no legal value. Regulatory status must resolve to Regulation 1223/2009 and its Annexes."}'::jsonb,
  now()
),
(
  'eu_sccs','European Commission','Scientific Committee on Consumer Safety (SCCS)',
  'scientific_opinion_index',5,'EU','en','https://health.ec.europa.eu/scientific-committees/scientific-committee-consumer-safety-sccs_en',
  'html',true,false,true,false,'verified','irregular',
  '{"domain":"cosmetic_ingredient_safety","includes":["opinions","statements","notes_of_guidance"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'eu_echa_clh','European Chemicals Agency','Harmonised classification and labelling (CLH)',
  'chemical_hazard_registry',5,'EU','en','https://echa.europa.eu/regulations/clp/harmonised-classification-and-labelling',
  'html',true,false,true,false,'verified','event_driven',
  '{"domain":"chemical_hazards","includes":["CMR","sensitisation","ED","PBT","vPvB","PMT","vPvM"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","legalCaveat":"Use Annex VI/Official Journal for legally binding harmonised classifications."}'::jsonb,
  now()
),
(
  'eu_safety_gate','European Commission','Safety Gate alerts search',
  'recall_system',5,'EU','en','https://ec.europa.eu/safety-gate-alerts/screen/search?resetSearch=true',
  'html',true,false,true,false,'verified','continuous',
  '{"domain":"dangerous_non_food_products","category":"cosmetics"}'::jsonb,
  '{"discoveryDate":"2026-10-04","capabilities":["search","alert_detail","export"]}'::jsonb,
  now()
),
(
  'gb_opss_cosmetics','Office for Product Safety and Standards','Consumer products: cosmetics',
  'regulatory_guidance',5,'GB','en','https://www.gov.uk/guidance/consumer-products-cosmetics',
  'html',true,false,true,false,'verified','event_driven',
  '{"domain":"cosmetics","scope":"Great Britain"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'gb_opss_cosmetics_recalls','Office for Product Safety and Standards','Product Safety Alerts, Reports and Recalls — Cosmetics',
  'recall_system',5,'GB','en','https://www.gov.uk/product-safety-alerts-reports-recalls?product_category=cosmetics',
  'html',true,false,true,false,'verified','continuous',
  '{"domain":"product_safety","category":"cosmetics"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'us_fda_mocra','U.S. Food and Drug Administration','Modernization of Cosmetics Regulation Act of 2022 (MoCRA)',
  'regulatory_guidance',5,'US','en','https://www.fda.gov/cosmetics/cosmetics-laws-regulations/modernization-cosmetics-regulation-act-2022-mocra',
  'html',true,false,true,false,'verified','event_driven',
  '{"domain":"cosmetics","includes":["mandatory_recall_authority","adverse_events","facility_registration","product_listing"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'us_fda_cosmetics_enforcement','U.S. Food and Drug Administration','Cosmetics Compliance & Enforcement',
  'recall_system',5,'US','en','https://www.fda.gov/cosmetics/cosmetics-compliance-enforcement',
  'html',true,false,true,false,'verified','continuous',
  '{"domain":"cosmetics","includes":["recalls","warning_letters","import_alerts","enforcement_reports"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'us_fda_cosmetic_adverse_events','U.S. Food and Drug Administration','Cosmetic product complaints and adverse-event reporting',
  'regulatory_guidance',5,'US','en','https://www.fda.gov/cosmetics/resources-consumers-cosmetics/what-should-i-do-if-i-have-reaction-side-effect-cosmetic-product',
  'html',true,false,true,false,'verified','event_driven',
  '{"domain":"cosmetic_adverse_events","includes":["AEMS","serious_adverse_event_reporting"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'ca_health_canada_hotlist','Health Canada','Cosmetic Ingredient Hotlist',
  'regulatory_database',5,'CA','en','https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/cosmetic-ingredient-hotlist-prohibited-restricted-ingredients/hotlist.html',
  'html',true,false,true,false,'verified','irregular',
  '{"domain":"cosmetic_ingredients","includes":["prohibited","restricted","conditions_of_use","maximum_concentration"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","legalCaveat":"Administrative tool; underlying Food and Drugs Act and Cosmetic Regulations govern."}'::jsonb,
  now()
),
(
  'ca_recalls','Government of Canada','Find recalls, advisories and safety alerts',
  'recall_system',5,'CA','en','https://recalls-rappels.canada.ca/en',
  'html',true,false,true,false,'verified','daily',
  '{"domain":"recalls","availableFeeds":["CSV","JSON"],"feedUpdate":"daily"}'::jsonb,
  '{"discoveryDate":"2026-10-04","note":"Official portal advertises active and archived CSV/JSON datasets updated daily."}'::jsonb,
  now()
),
(
  'au_aicis_cosmetics','Australian Industrial Chemicals Introduction Scheme','Personal care, skincare, make-up and other cosmetic products',
  'regulatory_database',5,'AU','en','https://www.industrialchemicals.gov.au/cosmetics-and-soap/personal-care-skincare-make-and-other-cosmetic-products',
  'html',true,false,true,false,'verified','event_driven',
  '{"domain":"cosmetic_ingredients","includes":["industrial_chemical_inventory","introduction_categories"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'au_accc_recalls','Australian Competition and Consumer Commission','Search consumer product recalls',
  'recall_system',5,'AU','en','https://www.productsafety.gov.au/recalls',
  'html',true,false,true,false,'verified','continuous',
  '{"domain":"product_recalls","topic":"cosmetic_and_health_products"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'jp_mhlw_cosmetics','Ministry of Health, Labour and Welfare','Cosmetics and quasi-drugs regulatory information',
  'regulatory_database',5,'JP','ja','https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iyakuhin/keshouhin/index.html',
  'html',true,false,true,false,'verified','event_driven',
  '{"domain":"cosmetics","includes":["standards","notices","ingredient_rules"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'jp_pmda_cosmetics_recalls','Pharmaceuticals and Medical Devices Agency','Cosmetics and quasi-drugs recall information',
  'recall_system',5,'JP','ja','https://www.pmda.go.jp/safety/info-services/qdrugs-cosmetics/0002.html',
  'html',true,false,true,false,'verified','continuous',
  '{"domain":"recalls","category":"cosmetics_and_quasi_drugs","coverageFrom":"FY2024"}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'cn_nmpa_iecic','National Medical Products Administration','Inventory of Existing Cosmetic Ingredients (IECIC) administration',
  'regulatory_database',5,'CN','en','https://english.nmpa.gov.cn/2025-07/21/c_1118071.htm',
  'html',true,false,true,false,'verified','event_driven',
  '{"domain":"cosmetic_ingredients","topic":"IECIC","updateModel":"dynamic"}'::jsonb,
  '{"discoveryDate":"2026-10-04","note":"NMPA states future inventory changes will be continuously disclosed through its official cosmetics query channel."}'::jsonb,
  now()
),
(
  'tgb_sds','The GelBottle Inc','SDS Safety Sheets',
  'manufacturer_sds',4,'GLOBAL','en','https://thegelbottle.com/pro-hub/sds-safety-sheets/',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"The GelBottle Inc","includes":["original_TPO_formulations","TPO_free_reformulations","BIAB","gel_colour"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","importantVersioningSignal":"Manufacturer explicitly separates original TPO-containing SDS from TPO-free reformulations."}'::jsonb,
  now()
),
(
  'apres_sds','Aprés Nail','Safety Data Sheets',
  'manufacturer_sds',4,'GLOBAL','en','https://help.apresnail.com/en-US/safety-data-sheets-3782116',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"Aprés Nail","includes":["Gel Couleur","Extend Gel","builders","collections"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","importantVersioningSignal":"Current SDS library identifies the 2025 200 Gel Couleur collection as TPO+HEMA free."}'::jsonb,
  now()
),
(
  'kiara_sky_sds','Kiara Sky Professional Nails','Safety Data Sheets',
  'manufacturer_sds',4,'GLOBAL','en','https://kiarasky.com/pages/sds',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"Kiara Sky","includes":["gel_polish","dip_powder","acrylic","essentials"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
),
(
  'opi_product_ingredients','OPI','OPI product pages with ingredient lists',
  'manufacturer_product',4,'GLOBAL','en','https://www.opi.com/',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"OPI","scope":"product_pages","fields":["shade","system","ingredients","usage"]}'::jsonb,
  '{"discoveryDate":"2026-10-04","importantVersioningSignal":"Regional/current product pages can expose materially different ingredient lists; capture URL, market and retrieval date per product."}'::jsonb,
  now()
),
(
  'essie_product_ingredients','essie','essie product pages with ingredient lists',
  'manufacturer_product',4,'GLOBAL','en','https://www.essie.com/',
  'html',true,false,false,true,'verified','event_driven',
  '{"brand":"essie","scope":"product_pages","fields":["shade","line","ingredients","usage"]}'::jsonb,
  '{"discoveryDate":"2026-10-04"}'::jsonb,
  now()
)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.nyxi_research_targets(
  target_type,target_key,display_name,priority,research_status,required_source_families,metadata
) VALUES
('jurisdiction','EU','European Union',100,'in_progress',ARRAY['law','regulatory_database','scientific_opinion_index','chemical_hazard_registry','recall_system'],'{"phase":0}'::jsonb),
('jurisdiction','GB','Great Britain',95,'in_progress',ARRAY['law','regulatory_database','recall_system'],'{"phase":0}'::jsonb),
('jurisdiction','US','United States',95,'in_progress',ARRAY['law','regulatory_database','recall_system'],'{"phase":0}'::jsonb),
('jurisdiction','CA','Canada',90,'in_progress',ARRAY['regulatory_database','recall_system'],'{"phase":0}'::jsonb),
('jurisdiction','AU','Australia',85,'in_progress',ARRAY['regulatory_database','recall_system'],'{"phase":0}'::jsonb),
('jurisdiction','JP','Japan',85,'in_progress',ARRAY['regulatory_database','recall_system'],'{"phase":0}'::jsonb),
('jurisdiction','CN','China',85,'in_progress',ARRAY['regulatory_database','recall_system'],'{"phase":0}'::jsonb)
ON CONFLICT (target_type,target_key) DO NOTHING;

INSERT INTO public.nyxi_research_targets(
  target_type,target_key,display_name,priority,research_status,required_source_families,metadata
)
SELECT
  'brand',
  lower(regexp_replace(brand_name,'[^a-zA-Z0-9]+','_','g')),
  brand_name,
  priority,
  CASE WHEN brand_name IN ('OPI','essie','The GelBottle Inc','Aprés Nail','Kiara Sky') THEN 'in_progress' ELSE 'queued' END,
  ARRAY['manufacturer_root','manufacturer_product','manufacturer_sds','manufacturer_catalogue','historical_archive'],
  jsonb_build_object(
    'phase',0,
    'objective','Discover primary product, ingredient, SDS, catalogue, colour-chart, reformulation and archive sources before classification.'
  )
FROM (VALUES
  ('OPI',100),('essie',100),('CND',100),('Gelish',100),('DND / DC',100),
  ('Sally Hansen',98),('The GelBottle Inc',100),('Aprés Nail',100),('Kiara Sky',100),('Bio Sculpture',98),
  ('Akzentz / Luxio',98),('ORLY',96),('Zoya',94),('China Glaze',94),('KOKOIST',98),
  ('Semilac',98),('NEONAIL',98),('Indigo Nails',96),('Manucurist',94),('Mylee',92),
  ('Madam Glam',90),('Olive & June',88),('Mooncat',96),('ILNP',96),('Holo Taco',94),
  ('Cirque Colors',96),('Lights Lacquer',86),('Nailberry',84),('Londontown',84),('JINsoon',84),
  ('Deborah Lippmann',84),('Light Elegance',90),('Young Nails',88),('LeChat',88),('Cuccio',86),
  ('SNS',88),('Morgan Taylor',88),('Victoria Vynn',90),('Didier Lab',88),('Kodi Professional',90),
  ('Komilfo',86),('Claresa',84),('Born Pretty',90),('VENALISA',86),('Beetles',86),
  ('Modelones',84),('Chanel',90),('Dior',88),('Hermès',84),('Gucci Beauty',82)
) AS b(brand_name,priority)
ON CONFLICT (target_type,target_key) DO NOTHING;

INSERT INTO public.nyxi_source_target_links(source_id,target_id,relation)
SELECT s.id,t.id,'primary_for'
FROM public.nyxi_sources s
JOIN public.nyxi_research_targets t
  ON t.target_type='jurisdiction'
 AND t.target_key=s.jurisdiction
WHERE s.regulatory=true
ON CONFLICT DO NOTHING;

INSERT INTO public.nyxi_source_target_links(source_id,target_id,relation)
SELECT s.id,t.id,'primary_for'
FROM public.nyxi_sources s
JOIN public.nyxi_research_targets t
  ON t.target_type='brand'
 AND (
   (s.source_key='tgb_sds' AND t.display_name='The GelBottle Inc') OR
   (s.source_key='apres_sds' AND t.display_name='Aprés Nail') OR
   (s.source_key='kiara_sky_sds' AND t.display_name='Kiara Sky') OR
   (s.source_key='opi_product_ingredients' AND t.display_name='OPI') OR
   (s.source_key='essie_product_ingredients' AND t.display_name='essie')
 )
ON CONFLICT DO NOTHING;

INSERT INTO public.nyxi_source_crawl_state(source_id,next_check_at)
SELECT id,now()
FROM public.nyxi_sources
WHERE source_status='verified'
ON CONFLICT (source_id) DO NOTHING;

COMMIT;

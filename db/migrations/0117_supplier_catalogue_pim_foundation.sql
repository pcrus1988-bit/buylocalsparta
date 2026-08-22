-- Buy Local Sparta — supplier catalogue/PIM source foundation.
-- Preserves rich supplier evidence independently from canonical products and sellable vendor offers.

BEGIN;

-- ---------------------------------------------------------------------------
-- Source systems and immutable catalogue snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE catalog_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  code text NOT NULL,
  name text NOT NULL,
  source_kind text NOT NULL
    CHECK (source_kind IN ('supplier','manufacturer','distributor','vendor','other')),
  organization_id uuid REFERENCES catalog_organizations(id),
  website text,
  default_currency char(3) NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, code),
  CHECK (length(btrim(code)) > 0),
  CHECK (length(btrim(name)) > 0)
);

CREATE TABLE catalog_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES catalog_sources(id),
  source_filename text,
  source_hash text NOT NULL,
  source_version text,
  observed_at timestamptz,
  row_count integer CHECK (row_count IS NULL OR row_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_hash),
  UNIQUE (id, source_id),
  CHECK (length(btrim(source_hash)) > 0)
);

COMMENT ON TABLE catalog_sources IS
  'External supplier/manufacturer/distributor/vendor catalogue source. Source data is evidence, not canonical catalogue truth.';
COMMENT ON TABLE catalog_source_snapshots IS
  'Immutable point-in-time source catalogue snapshot identified by content hash.';

-- ---------------------------------------------------------------------------
-- Supplier/source taxonomy kept separate from KONTAMOU canonical taxonomy
-- ---------------------------------------------------------------------------
CREATE TABLE catalog_source_taxonomy_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES catalog_sources(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES catalog_source_taxonomy_nodes(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_label text NOT NULL,
  depth integer NOT NULL CHECK (depth >= 0),
  path_labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  path_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_url text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_key),
  UNIQUE (id, source_id),
  CHECK (length(btrim(source_key)) > 0),
  CHECK (length(btrim(source_label)) > 0)
);
CREATE INDEX catalog_source_taxonomy_parent_idx
  ON catalog_source_taxonomy_nodes(source_id,parent_id,depth);

CREATE TABLE catalog_source_taxonomy_observations (
  snapshot_id uuid NOT NULL REFERENCES catalog_source_snapshots(id) ON DELETE CASCADE,
  source_taxonomy_node_id uuid NOT NULL REFERENCES catalog_source_taxonomy_nodes(id) ON DELETE CASCADE,
  product_count integer CHECK (product_count IS NULL OR product_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, source_taxonomy_node_id)
);

CREATE TABLE catalog_source_category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_taxonomy_node_id uuid NOT NULL REFERENCES catalog_source_taxonomy_nodes(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  mapping_status text NOT NULL DEFAULT 'candidate'
    CHECK (mapping_status IN ('candidate','approved','rejected','superseded')),
  mapping_method text NOT NULL DEFAULT 'manual'
    CHECK (mapping_method IN ('manual','rule','import','enrichment')),
  confidence numeric(6,5),
  reason text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE UNIQUE INDEX catalog_source_category_mapping_approved_uidx
  ON catalog_source_category_mappings(source_taxonomy_node_id)
  WHERE mapping_status='approved';
CREATE INDEX catalog_source_category_mapping_category_idx
  ON catalog_source_category_mappings(category_id,mapping_status);

COMMENT ON TABLE catalog_source_category_mappings IS
  'Governed mapping from a supplier/source taxonomy node to KONTAMOU canonical taxonomy. Supplier taxonomy is never overwritten.';

-- ---------------------------------------------------------------------------
-- Raw source products: catalogue presence does not imply price, stock or offer
-- ---------------------------------------------------------------------------
CREATE TABLE catalog_source_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES catalog_sources(id),
  source_taxonomy_node_id uuid,
  source_product_key text NOT NULL,
  supplier_code text,
  title text NOT NULL,
  source_url text,
  source_image_url text,
  source_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL,
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_state text NOT NULL DEFAULT 'unpriced'
    CHECK (price_state IN ('unpriced','matched','conflict','review_required')),
  classification_status text NOT NULL DEFAULT 'raw'
    CHECK (classification_status IN ('raw','mapped','review_required','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, source_product_key),
  FOREIGN KEY (snapshot_id, source_id) REFERENCES catalog_source_snapshots(id, source_id) ON DELETE CASCADE,
  FOREIGN KEY (source_taxonomy_node_id, source_id) REFERENCES catalog_source_taxonomy_nodes(id, source_id),
  CHECK (length(btrim(source_product_key)) > 0),
  CHECK (length(btrim(title)) > 0)
);
CREATE INDEX catalog_source_products_source_code_idx
  ON catalog_source_products(source_id,supplier_code)
  WHERE supplier_code IS NOT NULL;
CREATE INDEX catalog_source_products_taxonomy_idx
  ON catalog_source_products(source_taxonomy_node_id,classification_status);
CREATE INDEX catalog_source_products_price_state_idx
  ON catalog_source_products(source_id,price_state);

COMMENT ON TABLE catalog_source_products IS
  'Point-in-time external catalogue row. It may be unpriced and must not be treated as an inventory or vendor offer record.';

-- Parsed source attributes can be mapped gradually into the existing governed
-- attribute_definitions / Product Type schema without throwing rich source data away.
CREATE TABLE catalog_source_attribute_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES catalog_source_products(id) ON DELETE CASCADE,
  source_attribute_key text NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  attribute_id uuid REFERENCES attribute_definitions(id),
  raw_value jsonb NOT NULL,
  normalized_value jsonb,
  source_unit text,
  mapping_status text NOT NULL DEFAULT 'unmapped'
    CHECK (mapping_status IN ('unmapped','mapped','review_required','rejected')),
  confidence numeric(6,5),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_product_id, source_attribute_key, position),
  CHECK (length(btrim(source_attribute_key)) > 0),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE INDEX catalog_source_attribute_mapped_idx
  ON catalog_source_attribute_observations(attribute_id,mapping_status)
  WHERE attribute_id IS NOT NULL;

-- Matching is many-candidate until one link is explicitly approved.
CREATE TABLE catalog_source_product_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES catalog_source_products(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  link_status text NOT NULL DEFAULT 'candidate'
    CHECK (link_status IN ('candidate','approved','rejected','superseded')),
  match_method text NOT NULL DEFAULT 'manual'
    CHECK (match_method IN ('exact_gtin','brand_mpn','supplier_code','model','fingerprint','manual','enrichment')),
  confidence numeric(6,5),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_product_id, canonical_variant_id),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE UNIQUE INDEX catalog_source_product_link_approved_uidx
  ON catalog_source_product_links(source_product_id)
  WHERE link_status='approved';
CREATE INDEX catalog_source_product_link_variant_idx
  ON catalog_source_product_links(canonical_variant_id,link_status);

-- ---------------------------------------------------------------------------
-- Price evidence: separate source observation from current commercial offer
-- ---------------------------------------------------------------------------
CREATE TABLE catalog_price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES catalog_source_products(id) ON DELETE CASCADE,
  canonical_variant_id uuid REFERENCES canonical_variants(id) ON DELETE SET NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  tax_inclusive boolean,
  price_kind text NOT NULL DEFAULT 'catalogue'
    CHECK (price_kind IN ('catalogue','rrp','promotion','offer','unknown')),
  observation_status text NOT NULL DEFAULT 'observed'
    CHECK (observation_status IN ('observed','review_required','conflict','rejected','superseded')),
  match_method text,
  confidence numeric(6,5),
  source_reference text,
  observed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE INDEX catalog_price_observations_product_idx
  ON catalog_price_observations(source_product_id,observation_status,observed_at DESC);
CREATE INDEX catalog_price_observations_variant_idx
  ON catalog_price_observations(canonical_variant_id,observation_status,observed_at DESC)
  WHERE canonical_variant_id IS NOT NULL;

COMMENT ON TABLE catalog_price_observations IS
  'Provenance-bearing external price evidence. This table never replaces vendor_offers customer/supplier prices.';

-- ---------------------------------------------------------------------------
-- Compatibility evidence and normalized platforms
-- ---------------------------------------------------------------------------
CREATE TABLE compatibility_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  brand_id uuid REFERENCES brands(id),
  code text NOT NULL,
  name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(code)) > 0),
  CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX compatibility_platforms_identity_uidx
  ON compatibility_platforms(market_id,COALESCE(brand_id,'00000000-0000-0000-0000-000000000000'::uuid),code);

CREATE TABLE product_compatibility_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES catalog_source_products(id) ON DELETE CASCADE,
  subject_canonical_variant_id uuid REFERENCES canonical_variants(id) ON DELETE CASCADE,
  target_kind text NOT NULL
    CHECK (target_kind IN ('canonical_variant','product_family','platform','external_model','interface')),
  target_canonical_variant_id uuid REFERENCES canonical_variants(id) ON DELETE CASCADE,
  target_product_family_id uuid REFERENCES product_families(id) ON DELETE CASCADE,
  target_platform_id uuid REFERENCES compatibility_platforms(id) ON DELETE CASCADE,
  target_reference text,
  relationship_type text NOT NULL
    CHECK (relationship_type IN ('compatible_with','fits','uses_platform','requires','interface_match')),
  evidence_level text NOT NULL
    CHECK (evidence_level IN ('explicit','platform','dimensional','heuristic')),
  review_status text NOT NULL DEFAULT 'candidate'
    CHECK (review_status IN ('candidate','verified','rejected','superseded')),
  confidence numeric(6,5) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_reference text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (target_kind='canonical_variant' AND target_canonical_variant_id IS NOT NULL AND target_product_family_id IS NULL AND target_platform_id IS NULL)
    OR (target_kind='product_family' AND target_canonical_variant_id IS NULL AND target_product_family_id IS NOT NULL AND target_platform_id IS NULL)
    OR (target_kind='platform' AND target_canonical_variant_id IS NULL AND target_product_family_id IS NULL AND target_platform_id IS NOT NULL)
    OR (target_kind IN ('external_model','interface') AND target_canonical_variant_id IS NULL AND target_product_family_id IS NULL AND target_platform_id IS NULL AND target_reference IS NOT NULL AND length(btrim(target_reference)) > 0)
  ),
  CHECK (subject_canonical_variant_id IS NULL OR subject_canonical_variant_id IS DISTINCT FROM target_canonical_variant_id)
);
CREATE INDEX product_compatibility_subject_idx
  ON product_compatibility_claims(subject_canonical_variant_id,review_status)
  WHERE subject_canonical_variant_id IS NOT NULL;
CREATE INDEX product_compatibility_source_idx
  ON product_compatibility_claims(source_product_id,review_status,evidence_level);
CREATE INDEX product_compatibility_target_variant_idx
  ON product_compatibility_claims(target_canonical_variant_id,review_status)
  WHERE target_canonical_variant_id IS NOT NULL;

COMMENT ON TABLE product_compatibility_claims IS
  'Evidence-bearing compatibility claims. Dimensional/heuristic matches remain candidates until reviewed and must not be rendered as verified compatibility.';

-- ---------------------------------------------------------------------------
-- Vendor assortment: catalogue coverage is deliberately distinct from vendor_offer
-- ---------------------------------------------------------------------------
CREATE TABLE vendor_catalog_assortments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES vendor_locations(id) ON DELETE CASCADE,
  source_product_id uuid REFERENCES catalog_source_products(id) ON DELETE SET NULL,
  canonical_variant_id uuid REFERENCES canonical_variants(id) ON DELETE SET NULL,
  vendor_sku text,
  assortment_status text NOT NULL DEFAULT 'candidate'
    CHECK (assortment_status IN ('candidate','confirmed','paused','discontinued','rejected')),
  availability_mode text NOT NULL DEFAULT 'unknown'
    CHECK (availability_mode IN ('unknown','in_stock','orderable','ask_vendor')),
  confirmation_source text
    CHECK (confirmation_source IS NULL OR confirmation_source IN ('vendor','platform','contract','api','import')),
  confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (assortment_status <> 'confirmed' OR canonical_variant_id IS NOT NULL),
  CHECK (availability_mode <> 'in_stock' OR assortment_status='confirmed')
);
CREATE UNIQUE INDEX vendor_catalog_assortment_source_uidx
  ON vendor_catalog_assortments(vendor_id,location_id,source_product_id)
  WHERE source_product_id IS NOT NULL;
CREATE UNIQUE INDEX vendor_catalog_assortment_variant_uidx
  ON vendor_catalog_assortments(vendor_id,location_id,canonical_variant_id)
  WHERE canonical_variant_id IS NOT NULL AND assortment_status <> 'discontinued';
CREATE INDEX vendor_catalog_assortments_vendor_idx
  ON vendor_catalog_assortments(vendor_id,assortment_status,availability_mode);

COMMENT ON TABLE vendor_catalog_assortments IS
  'Vendor acknowledgement that a product is in its assortment or can be sourced. It is not a sellable offer and never implies confirmed stock or price.';

-- ---------------------------------------------------------------------------
-- Governance / RLS. Source evidence is platform-managed; vendors may inspect and
-- maintain only their own assortment rows. Public/anonymous roles receive no policy.
-- ---------------------------------------------------------------------------
ALTER TABLE catalog_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_taxonomy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_taxonomy_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_category_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_attribute_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source_product_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compatibility_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_compatibility_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_catalog_assortments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON catalog_sources
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_source_snapshots
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_source_taxonomy_nodes
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_source_taxonomy_observations
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_source_category_mappings
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_source_products
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_source_attribute_observations
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_source_product_links
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_price_observations
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON compatibility_platforms
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON product_compatibility_claims
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_catalog_assortment_scope ON vendor_catalog_assortments
  FOR ALL
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

-- Snapshot/source rows are evidence. Corrections arrive as a new snapshot instead of
-- mutating the historical source record.
CREATE OR REPLACE FUNCTION bls_private.prevent_catalog_source_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  RAISE EXCEPTION 'catalog source snapshot evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS catalog_source_snapshots_no_mutation ON catalog_source_snapshots;
CREATE TRIGGER catalog_source_snapshots_no_mutation
  BEFORE UPDATE OR DELETE ON catalog_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_catalog_source_evidence_mutation();

DROP TRIGGER IF EXISTS catalog_source_products_no_mutation ON catalog_source_products;
CREATE TRIGGER catalog_source_products_no_mutation
  BEFORE UPDATE OR DELETE ON catalog_source_products
  FOR EACH ROW EXECUTE FUNCTION bls_private.prevent_catalog_source_evidence_mutation();

GRANT EXECUTE ON FUNCTION bls_private.prevent_catalog_source_evidence_mutation()
  TO bls_app_runtime,bls_platform_runtime;

COMMIT;

-- Buy Local Sparta — canonical identifiers plus brand/manufacturer governance.
-- Legacy canonical_variants.gtin/mpn remain as compatibility columns; normalized
-- product_identifiers becomes the structured multi-identifier layer.

BEGIN;

-- ---------------------------------------------------------------------------
-- Brand governance and manufacturer/owner organizations
-- ---------------------------------------------------------------------------
ALTER TABLE brands
  ADD COLUMN public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN logo_object_key text,
  ADD COLUMN country_code char(2),
  ADD COLUMN description text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE brands
  ADD CONSTRAINT brands_status_check CHECK (status IN ('active','retired','blocked'));

CREATE OR REPLACE FUNCTION bls_private.normalize_catalog_alias(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(value,'')), '[[:space:]]+', ' ', 'g'));
$$;

CREATE TABLE brand_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  locale text,
  source_namespace text NOT NULL DEFAULT 'catalog',
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, source_namespace, locale, normalized_alias),
  CHECK (length(btrim(alias)) > 0),
  CHECK (length(btrim(normalized_alias)) > 0)
);
CREATE INDEX brand_aliases_normalized_idx
  ON brand_aliases(normalized_alias, active, brand_id);

CREATE TABLE catalog_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  legal_name text NOT NULL,
  normalized_name text NOT NULL,
  website text,
  country_code char(2),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name),
  CHECK (length(btrim(legal_name)) > 0),
  CHECK (length(btrim(normalized_name)) > 0)
);

CREATE TABLE brand_organization_relationships (
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES catalog_organizations(id) ON DELETE CASCADE,
  relationship_type text NOT NULL
    CHECK (relationship_type IN ('brand_owner','manufacturer','licensor','distributor')),
  is_primary boolean NOT NULL DEFAULT false,
  valid_from date,
  valid_to date,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, organization_id, relationship_type),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX brand_organization_primary_idx
  ON brand_organization_relationships(brand_id, relationship_type)
  WHERE is_primary=true AND valid_to IS NULL;

INSERT INTO brand_aliases(brand_id,source_namespace,alias,normalized_alias)
SELECT b.id,'catalog',b.name,bls_private.normalize_catalog_alias(b.name)
FROM brands b
ON CONFLICT DO NOTHING;

COMMENT ON TABLE catalog_organizations IS
  'Legal/manufacturing/brand-owner organizations kept separate from consumer-facing Brands.';
COMMENT ON TABLE brand_organization_relationships IS
  'Time-aware relationships between consumer-facing Brands and owner/manufacturer/licensor/distributor organizations.';

-- ---------------------------------------------------------------------------
-- Identifier validation helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bls_private.is_valid_gtin(value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  v text := btrim(COALESCE(value,''));
  n integer;
  i integer;
  total integer := 0;
  expected_check integer;
BEGIN
  IF v !~ '^[0-9]+$' THEN RETURN false; END IF;
  n := length(v);
  IF n NOT IN (8,12,13,14) THEN RETURN false; END IF;

  FOR i IN 1..n-1 LOOP
    total := total + substr(v,i,1)::integer *
      CASE WHEN ((n-i) % 2)=1 THEN 3 ELSE 1 END;
  END LOOP;

  expected_check := (10 - (total % 10)) % 10;
  RETURN expected_check = right(v,1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.is_valid_isbn10(value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  v text := upper(btrim(COALESCE(value,'')));
  i integer;
  digit integer;
  total integer := 0;
BEGIN
  IF v !~ '^[0-9]{9}[0-9X]$' THEN RETURN false; END IF;
  FOR i IN 1..10 LOOP
    digit := CASE WHEN i=10 AND substr(v,i,1)='X' THEN 10 ELSE substr(v,i,1)::integer END;
    total := total + (11-i) * digit;
  END LOOP;
  RETURN (total % 11)=0;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.is_valid_isbn13(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
  SELECT length(btrim(COALESCE(value,'')))=13
     AND left(btrim(value),3) IN ('978','979')
     AND bls_private.is_valid_gtin(btrim(value));
$$;

-- ---------------------------------------------------------------------------
-- Multiple canonical identifiers per sellable canonical variant
-- ---------------------------------------------------------------------------
CREATE TABLE product_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  identifier_type text NOT NULL
    CHECK (identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13','mpn','manufacturer_code','other')),
  issuer_brand_id uuid REFERENCES brands(id),
  normalized_value text NOT NULL,
  display_value text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','format_valid','externally_verified','rejected')),
  source text NOT NULL DEFAULT 'catalog_admin'
    CHECK (source IN ('legacy_column_sync','catalog_admin','vendor_submission','import','manufacturer','gs1','isbn_agency','enrichment')),
  source_reference text,
  confidence numeric(6,5),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(normalized_value)) > 0),
  CHECK (length(btrim(display_value)) > 0),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CHECK (identifier_type <> 'gtin8' OR (length(normalized_value)=8 AND bls_private.is_valid_gtin(normalized_value))),
  CHECK (identifier_type <> 'gtin12' OR (length(normalized_value)=12 AND bls_private.is_valid_gtin(normalized_value))),
  CHECK (identifier_type <> 'gtin13' OR (length(normalized_value)=13 AND bls_private.is_valid_gtin(normalized_value))),
  CHECK (identifier_type <> 'gtin14' OR (length(normalized_value)=14 AND bls_private.is_valid_gtin(normalized_value))),
  CHECK (identifier_type <> 'isbn10' OR bls_private.is_valid_isbn10(normalized_value)),
  CHECK (identifier_type <> 'isbn13' OR bls_private.is_valid_isbn13(normalized_value)),
  CHECK (identifier_type <> 'mpn' OR issuer_brand_id IS NOT NULL)
);

CREATE UNIQUE INDEX product_identifiers_global_unique_idx
  ON product_identifiers(identifier_type,normalized_value)
  WHERE active=true AND identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13');
CREATE UNIQUE INDEX product_identifiers_brand_scoped_unique_idx
  ON product_identifiers(identifier_type,issuer_brand_id,normalized_value)
  WHERE active=true AND identifier_type IN ('mpn','manufacturer_code') AND issuer_brand_id IS NOT NULL;
CREATE UNIQUE INDEX product_identifiers_variant_value_idx
  ON product_identifiers(canonical_variant_id,identifier_type,COALESCE(issuer_brand_id,'00000000-0000-0000-0000-000000000000'::uuid),normalized_value)
  WHERE active=true;
CREATE INDEX product_identifiers_variant_idx
  ON product_identifiers(canonical_variant_id,active,is_primary,identifier_type);
CREATE INDEX product_identifiers_lookup_idx
  ON product_identifiers(normalized_value,identifier_type)
  WHERE active=true;

COMMENT ON TABLE product_identifiers IS
  'Scheme-aware canonical identifiers. GTIN/ISBN are globally unique; MPN/manufacturer codes are scoped by Brand.';

-- Backfill current identifiers. Books get explicit ISBN rather than treating the same
-- number as a manufacturer part number. Other GTINs retain their actual GTIN length.
INSERT INTO product_identifiers(
  canonical_variant_id,identifier_type,normalized_value,display_value,active,is_primary,
  verification_status,source,confidence
)
SELECT
  cv.id,
  CASE
    WHEN pt.code='book' AND length(cv.gtin)=13 AND left(cv.gtin,3) IN ('978','979') THEN 'isbn13'
    WHEN length(cv.gtin)=8 THEN 'gtin8'
    WHEN length(cv.gtin)=12 THEN 'gtin12'
    WHEN length(cv.gtin)=13 THEN 'gtin13'
    WHEN length(cv.gtin)=14 THEN 'gtin14'
  END,
  btrim(cv.gtin),btrim(cv.gtin),true,true,'format_valid','legacy_column_sync',1.00000
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
LEFT JOIN product_types pt ON pt.id=pf.product_type_id
WHERE cv.gtin IS NOT NULL
  AND btrim(cv.gtin) <> ''
  AND (
    (pt.code='book' AND bls_private.is_valid_isbn13(cv.gtin))
    OR
    (pt.code IS DISTINCT FROM 'book' AND bls_private.is_valid_gtin(cv.gtin))
  )
ON CONFLICT DO NOTHING;

INSERT INTO product_identifiers(
  canonical_variant_id,identifier_type,issuer_brand_id,normalized_value,display_value,
  active,is_primary,verification_status,source,confidence
)
SELECT
  cv.id,'mpn',cv.brand_id,btrim(cv.mpn),btrim(cv.mpn),true,
  NOT EXISTS (
    SELECT 1 FROM product_identifiers pi
    WHERE pi.canonical_variant_id=cv.id AND pi.active=true AND pi.is_primary=true
  ),
  'unverified','legacy_column_sync',1.00000
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
LEFT JOIN product_types pt ON pt.id=pf.product_type_id
WHERE cv.mpn IS NOT NULL
  AND btrim(cv.mpn) <> ''
  AND cv.brand_id IS NOT NULL
  AND NOT (pt.code='book' AND cv.gtin IS NOT NULL AND btrim(cv.mpn)=btrim(cv.gtin))
ON CONFLICT DO NOTHING;

-- Compatibility sync for future legacy-column writes. Corrections deactivate only
-- prior rows originating from the compatibility bridge, preserving externally verified provenance.
CREATE OR REPLACE FUNCTION bls_private.sync_legacy_variant_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  product_type_code text;
  gtin_type text;
BEGIN
  SELECT pt.code INTO product_type_code
  FROM public.product_families pf
  LEFT JOIN public.product_types pt ON pt.id=pf.product_type_id
  WHERE pf.id=NEW.family_id;

  IF TG_OP='UPDATE' AND OLD.gtin IS DISTINCT FROM NEW.gtin THEN
    UPDATE public.product_identifiers
    SET active=false,updated_at=now()
    WHERE canonical_variant_id=NEW.id
      AND source='legacy_column_sync'
      AND identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
      AND active=true;
  END IF;

  IF NEW.gtin IS NOT NULL AND btrim(NEW.gtin)<>'' THEN
    gtin_type := CASE
      WHEN product_type_code='book' AND length(btrim(NEW.gtin))=13 AND left(btrim(NEW.gtin),3) IN ('978','979') THEN 'isbn13'
      WHEN length(btrim(NEW.gtin))=8 THEN 'gtin8'
      WHEN length(btrim(NEW.gtin))=12 THEN 'gtin12'
      WHEN length(btrim(NEW.gtin))=13 THEN 'gtin13'
      WHEN length(btrim(NEW.gtin))=14 THEN 'gtin14'
      ELSE NULL
    END;

    IF gtin_type IS NOT NULL
       AND ((gtin_type='isbn13' AND bls_private.is_valid_isbn13(NEW.gtin))
            OR (gtin_type<>'isbn13' AND bls_private.is_valid_gtin(NEW.gtin))) THEN
      INSERT INTO public.product_identifiers(
        canonical_variant_id,identifier_type,normalized_value,display_value,active,is_primary,
        verification_status,source,confidence
      ) VALUES (
        NEW.id,gtin_type,btrim(NEW.gtin),btrim(NEW.gtin),true,true,'format_valid','legacy_column_sync',1.00000
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF TG_OP='UPDATE' AND (OLD.mpn IS DISTINCT FROM NEW.mpn OR OLD.brand_id IS DISTINCT FROM NEW.brand_id) THEN
    UPDATE public.product_identifiers
    SET active=false,updated_at=now()
    WHERE canonical_variant_id=NEW.id
      AND source='legacy_column_sync'
      AND identifier_type='mpn'
      AND active=true;
  END IF;

  IF NEW.mpn IS NOT NULL AND btrim(NEW.mpn)<>'' AND NEW.brand_id IS NOT NULL
     AND NOT (product_type_code='book' AND NEW.gtin IS NOT NULL AND btrim(NEW.mpn)=btrim(NEW.gtin)) THEN
    INSERT INTO public.product_identifiers(
      canonical_variant_id,identifier_type,issuer_brand_id,normalized_value,display_value,
      active,is_primary,verification_status,source,confidence
    ) VALUES (
      NEW.id,'mpn',NEW.brand_id,btrim(NEW.mpn),btrim(NEW.mpn),true,
      NOT EXISTS (SELECT 1 FROM public.product_identifiers pi WHERE pi.canonical_variant_id=NEW.id AND pi.active=true AND pi.is_primary=true),
      'unverified','legacy_column_sync',1.00000
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER canonical_variants_sync_legacy_identifiers
  AFTER INSERT OR UPDATE OF gtin,mpn,brand_id,family_id ON canonical_variants
  FOR EACH ROW EXECUTE FUNCTION bls_private.sync_legacy_variant_identifiers();

-- RLS
ALTER TABLE brand_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_organization_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_identifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON brand_aliases FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON catalog_organizations FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON brand_organization_relationships FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON product_identifiers FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

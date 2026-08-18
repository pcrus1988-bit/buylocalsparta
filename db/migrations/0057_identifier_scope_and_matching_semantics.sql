-- Buy Local Sparta — distinguish globally unique trade-item identifiers from
-- manufacturer/style numbers that may repeat across size/colour variants.

BEGIN;

DROP INDEX IF EXISTS product_identifiers_brand_scoped_unique_idx;

ALTER TABLE product_identifiers
  ADD COLUMN identifier_scope text NOT NULL DEFAULT 'unknown';

ALTER TABLE product_identifiers
  ADD CONSTRAINT product_identifiers_scope_check
  CHECK (identifier_scope IN ('trade_item','family','style','unknown'));

-- Backfill pre-existing rows before enforcing the strong-identifier scope invariant.
UPDATE product_identifiers
SET identifier_scope='trade_item',updated_at=now()
WHERE identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13');

UPDATE product_identifiers
SET identifier_scope='unknown',updated_at=now()
WHERE identifier_type IN ('mpn','manufacturer_code')
  AND source='legacy_column_sync';

ALTER TABLE product_identifiers
  ADD CONSTRAINT product_identifiers_strong_scope_check
  CHECK (
    identifier_type NOT IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13')
    OR identifier_scope='trade_item'
  );

CREATE OR REPLACE FUNCTION bls_private.normalize_identifier_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn10','isbn13') THEN
    NEW.identifier_scope := 'trade_item';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_identifiers_normalize_scope
  BEFORE INSERT OR UPDATE OF identifier_type,identifier_scope ON product_identifiers
  FOR EACH ROW EXECUTE FUNCTION bls_private.normalize_identifier_scope();

CREATE INDEX product_identifiers_brand_scoped_lookup_idx
  ON product_identifiers(identifier_type,issuer_brand_id,normalized_value,identifier_scope,active)
  WHERE identifier_type IN ('mpn','manufacturer_code') AND issuer_brand_id IS NOT NULL;

COMMENT ON COLUMN product_identifiers.identifier_scope IS
  'trade_item = exact sellable identity; family/style may repeat across canonical variants; unknown is matching evidence that requires corroboration.';

COMMIT;

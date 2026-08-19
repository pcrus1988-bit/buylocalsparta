-- KONTA MOY — immutable product tax profile audit metadata.
BEGIN;

ALTER TABLE product_tax_profiles
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS profile_hash text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);

CREATE UNIQUE INDEX IF NOT EXISTS product_tax_profiles_variant_effective_uidx
  ON product_tax_profiles(canonical_variant_id,effective_from)
  WHERE canonical_variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_tax_profiles_offer_effective_uidx
  ON product_tax_profiles(vendor_offer_id,effective_from)
  WHERE vendor_offer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_tax_profiles_hash_uidx
  ON product_tax_profiles(profile_hash)
  WHERE profile_hash IS NOT NULL;

COMMIT;

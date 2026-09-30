-- Keep first-page dropship browse reads index-ordered on the live incremental projection.
-- The public stable projection already has equivalent global newest/price indexes.
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_newest_global_idx
  ON bls_private.storefront_dropship_live_family
    (newest_at DESC, supplier_id, external_product_id)
  INCLUDE (available_until, min_price_minor)
  WHERE sellable = true;

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_price_global_idx
  ON bls_private.storefront_dropship_live_family
    (min_price_minor, supplier_id, external_product_id)
  INCLUDE (available_until, newest_at)
  WHERE sellable = true;

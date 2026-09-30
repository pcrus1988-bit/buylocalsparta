-- P0: keep large mixed vendor storefronts from scanning supplier-backed offers
-- when the initial local/assigned assortment is requested. The supplier-offer
-- anti-join remains in the read path as the final correctness check.
CREATE INDEX IF NOT EXISTS vendor_offers_vendor_local_catalog_idx
ON public.vendor_offers (vendor_id, updated_at DESC, id)
INCLUDE (canonical_variant_id, location_id, customer_price_minor)
WHERE status='approved'
  AND COALESCE(merchant_visible,true)=true
  AND COALESCE(merchant_pause_active,false)=false
  AND customer_price_minor>0
  AND COALESCE(source_payload->>'dropship','false') <> 'true';

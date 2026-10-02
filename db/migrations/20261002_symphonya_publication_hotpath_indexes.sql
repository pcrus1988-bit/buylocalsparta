-- Bound the hourly Symphonya publication sweep to current sellable stock
-- and make "latest vendor submission" a point lookup instead of a per-offer scan.

CREATE INDEX IF NOT EXISTS dropship_supplier_offers_publication_ready_idx
ON public.dropship_supplier_offers(
  supplier_id,
  availability_expires_at,
  vendor_offer_id
)
INCLUDE (
  id,
  external_product_id,
  cached_quantity,
  supplier_cost_minor,
  active
)
WHERE cached_available = true
  AND cached_quantity > 0
  AND supplier_cost_minor > 0;

CREATE INDEX IF NOT EXISTS vendor_product_submissions_vendor_variant_latest_idx
ON public.vendor_product_submissions(
  vendor_id,
  canonical_variant_id,
  updated_at DESC,
  id DESC
)
INCLUDE (status);

-- Cover the legacy public vendor-directory assortment summary while the storefront
-- itself is served from bounded/read-model catalogue APIs. A dropship partner can
-- own tens of thousands of approved offers; these partial indexes keep the public
-- profile's category/count projection index-only instead of forcing heap lookups
-- across the full offer/canonical tables on every vendor page request.

CREATE INDEX IF NOT EXISTS vendor_offers_public_assortment_cover_idx
  ON public.vendor_offers (vendor_id, canonical_variant_id, location_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS canonical_variants_public_assortment_cover_idx
  ON public.canonical_variants (id)
  INCLUDE (category_id)
  WHERE active = true
    AND suppressed = false
    AND recalled = false;

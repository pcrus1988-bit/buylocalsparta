-- The public vendor assortment path now reads from storefront_vendor_assortment_read_model.
-- The covering indexes tested during diagnosis did not materially improve the original
-- 62k-offer aggregate and are no longer on a hot read path, so remove their write/storage cost.
DROP INDEX IF EXISTS public.vendor_offers_public_assortment_cover_idx;
DROP INDEX IF EXISTS public.canonical_variants_public_assortment_cover_idx;

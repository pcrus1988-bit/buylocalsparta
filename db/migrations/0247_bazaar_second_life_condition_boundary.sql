-- Keep BAZAAR inventory strictly second-life.
-- Flexible future BAZAAR sources may use different second-life conditions,
-- but no BAZAAR canonical may present itself as factory-new inventory.

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_bazaar_not_new_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_bazaar_not_new_check
  CHECK (commerce_channel <> 'bazaar' OR condition <> 'new');

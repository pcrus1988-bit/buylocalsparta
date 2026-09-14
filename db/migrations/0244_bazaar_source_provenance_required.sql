-- 0244_bazaar_source_provenance_required.sql
-- Every BAZAAR canonical must carry an explicit provenance source.
--
-- The commerce channel is an identity boundary; allowing a BAZAAR canonical
-- without bazaar_source would weaken that boundary and make future returns,
-- open-box, display-stock, damaged-packaging or curated second-life ingestion
-- impossible to audit reliably.

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_bazaar_source_required_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_bazaar_source_required_check
  CHECK (commerce_channel <> 'bazaar' OR bazaar_source IS NOT NULL);

COMMENT ON CONSTRAINT canonical_variants_bazaar_source_required_check
ON public.canonical_variants IS
  'Requires every BAZAAR canonical to declare provenance (supplier_preloved, supplier_preowned_defect, customer_return, open_box, display_stock, damaged_packaging, or admin_curated).';

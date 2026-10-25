-- MAZI / 025: documented, human-attested current GEMI publicity evidence.
-- This is NOT a claim that the GEMI API was reached. The trusted marketplace
-- Super Admin personally checks the official public register and records
-- verifiable source and detailed evidence, separately from automated events.
ALTER TABLE public.mazi_interest_registry_rechecks
 ADD COLUMN review_evidence text,
 ADD COLUMN source_url text;
ALTER TABLE public.mazi_interest_registry_rechecks
 DROP CONSTRAINT mazi_interest_registry_rechecks_source_check;
ALTER TABLE public.mazi_interest_registry_rechecks
 ADD CONSTRAINT mazi_interest_registry_rechecks_source_check
 CHECK (source IN ('gemi_opendata_live','gemi_publicity_manual'));
ALTER TABLE public.mazi_interest_registry_rechecks
 ADD CONSTRAINT mazi_interest_manual_proof_required
 CHECK (
  source <> 'gemi_publicity_manual'
  OR (
   length(btrim(coalesce(review_evidence,''))) BETWEEN 80 AND 2000
   AND source_url LIKE 'https://publicity.businessportal.gr/%'
  )
 );
COMMENT ON COLUMN public.mazi_interest_registry_rechecks.review_evidence IS
 'Manual GEMI publicity review evidence (>=80 chars): official source, company active status, original AFM/GEMI match; human assertion, not API response.';
COMMENT ON COLUMN public.mazi_interest_registry_rechecks.source IS
 'gemi_opendata_live = real official API response; gemi_publicity_manual = accountable Super Admin manual check against the official public register.';

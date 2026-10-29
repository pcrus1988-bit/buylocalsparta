-- Additive hard stop on a fact verified from the connected MAZI Supabase project API:
-- production project region was us-east-1 on 2026-10-29.
-- No existing review records; never label this data flow EEA-only without a verified migration.
ALTER TABLE public.mazi_processor_reviews
 ADD CONSTRAINT mazi_processor_us_region_guard
 CHECK (review_state='reopened' OR domain_key <> 'database_auth_storage'
  OR transfer_mechanism <> 'eea_only_verified');

-- MAZI Article 28/30/44-49 processor and recipient evidence register.
-- Only administrative category facts and opaque internal evidence IDs. NO personal data,
-- signed PDFs, copies of agreements, credentials, contact lists, or fake attestations.
CREATE TABLE IF NOT EXISTS public.mazi_processor_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 domain_key text NOT NULL CHECK (domain_key IN (
  'hosting_runtime','database_auth_storage','transactional_email','observability_analytics',
  'payment_financial','third_party_integrations','backups_exports')),
 review_state text NOT NULL CHECK (review_state IN ('evidence_recorded','reopened')),
 usage_state text NOT NULL CHECK (usage_state IN ('in_use','not_used')),
 processing_role text NOT NULL CHECK (processing_role IN
  ('processor','independent_controller','joint_controller','no_personal_data','pending')),
 transfer_mechanism text NOT NULL CHECK (transfer_mechanism IN
  ('eea_only_verified','adequacy_verified','scc_tia_verified','exception_reviewed','not_applicable','not_assessed')),
 reviewed_on date NOT NULL,
 review_checks text[] NOT NULL DEFAULT '{}',
 agreement_reference text CHECK (agreement_reference IS NULL OR (
  char_length(agreement_reference) BETWEEN 12 AND 180
  AND agreement_reference ~ '^[A-Za-z0-9_./:#-]+$')),
 evidence_reference text NOT NULL CHECK (
  char_length(evidence_reference) BETWEEN 12 AND 180
  AND evidence_reference ~ '^[A-Za-z0-9_./:#-]+$'),
 findings text NOT NULL CHECK (char_length(btrim(findings)) BETWEEN 60 AND 700),
 actor_user_id uuid NOT NULL REFERENCES public.users(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK (reviewed_on <= (now() AT TIME ZONE 'Europe/Athens')::date),
 CHECK (review_state = 'reopened' OR (
   (usage_state='not_used' AND processing_role='no_personal_data'
     AND transfer_mechanism='not_applicable'
     AND review_checks = ARRAY['not_used_verified']::text[])
   OR
   (usage_state='in_use' AND processing_role <> 'pending'
    AND processing_role <> 'no_personal_data'
    AND transfer_mechanism NOT IN ('not_assessed','not_applicable')
    AND agreement_reference IS NOT NULL
    AND cardinality(review_checks)=8
    AND review_checks @> ARRAY[
      'processing_scope_and_role','binding_agreement',
      'instructions_and_confidentiality','security_and_assistance',
      'subprocessors_and_changes','locations_and_transfers',
      'return_deletion_backups','controller_counsel_review'
     ]::text[])
 )),
 CHECK (review_state='reopened' OR domain_key NOT IN
   ('hosting_runtime','database_auth_storage','transactional_email')
   OR usage_state='in_use')
);
CREATE INDEX IF NOT EXISTS mazi_processor_reviews_latest_idx
 ON public.mazi_processor_reviews(domain_key,recorded_at DESC,id DESC);

CREATE OR REPLACE FUNCTION mazi_private.prevent_processor_review_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI processor and transfer evidence is append-only';
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.prevent_processor_review_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS mazi_processor_review_append_only ON public.mazi_processor_reviews;
CREATE TRIGGER mazi_processor_review_append_only
 BEFORE UPDATE OR DELETE ON public.mazi_processor_reviews FOR EACH ROW
 EXECUTE FUNCTION mazi_private.prevent_processor_review_mutation();

ALTER TABLE public.mazi_processor_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mazi_processor_reviews
 FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT,INSERT ON public.mazi_processor_reviews TO bls_app_runtime,bls_platform_runtime;
DROP POLICY IF EXISTS mazi_processor_review_backend_select ON public.mazi_processor_reviews;
CREATE POLICY mazi_processor_review_backend_select ON public.mazi_processor_reviews
 FOR SELECT TO bls_app_runtime,bls_platform_runtime USING (true);
DROP POLICY IF EXISTS mazi_processor_review_backend_insert ON public.mazi_processor_reviews;
CREATE POLICY mazi_processor_review_backend_insert ON public.mazi_processor_reviews
 FOR INSERT TO bls_app_runtime,bls_platform_runtime WITH CHECK (true);
COMMENT ON TABLE public.mazi_processor_reviews IS
 'MAZI private processor/controller role, Article 28 contract and international transfer evidence inventory. Human assessment only; no implied legal approval.';

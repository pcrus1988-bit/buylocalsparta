-- MAZI retention evidence governance. This table is a human review ledger, NOT an erasure engine.
-- It contains opaque evidence references only, no subject identity, messages or raw personal data.
CREATE TABLE IF NOT EXISTS public.mazi_retention_category_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category_key text NOT NULL CHECK (category_key IN (
  'interest_intake','invitations_acceptance','members_identity','community_content',
  'marketplace_listings','moderation','marketing','services','finance',
  'votes_governance','audit_and_rights','infrastructure_processors')),
 review_state text NOT NULL CHECK (review_state IN ('evidence_recorded','reopened')),
 review_checks text[] NOT NULL DEFAULT '{}'::text[],
 evidence_reference text NOT NULL CHECK (char_length(evidence_reference) BETWEEN 12 AND 180
  AND evidence_reference ~ '^[A-Za-z0-9_./:#-]+$'),
 review_summary text NOT NULL CHECK (char_length(btrim(review_summary)) BETWEEN 40 AND 600),
 actor_user_id uuid NOT NULL REFERENCES public.users(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK (review_state <> 'evidence_recorded' OR (
  cardinality(review_checks)=6 AND
  review_checks @> ARRAY[
   'sources_mapped','lawful_basis_reviewed','time_trigger_reviewed',
   'deletion_and_holds_tested','processors_backups_checked','counsel_evidence_obtained'
  ]::text[]))
);
CREATE INDEX IF NOT EXISTS mazi_retention_category_reviews_latest
 ON public.mazi_retention_category_reviews(category_key,recorded_at DESC,id DESC);

CREATE OR REPLACE FUNCTION mazi_private.reject_retention_review_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI retention review history is append-only';
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.reject_retention_review_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS mazi_retention_review_append_only ON public.mazi_retention_category_reviews;
CREATE TRIGGER mazi_retention_review_append_only
 BEFORE UPDATE OR DELETE ON public.mazi_retention_category_reviews
 FOR EACH ROW EXECUTE FUNCTION mazi_private.reject_retention_review_mutation();

ALTER TABLE public.mazi_retention_category_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_retention_category_reviews FROM PUBLIC,anon,authenticated,service_role,
 bls_app_runtime,bls_platform_runtime;
GRANT SELECT,INSERT ON public.mazi_retention_category_reviews TO bls_app_runtime,bls_platform_runtime;
DROP POLICY IF EXISTS mazi_retention_backend_select ON public.mazi_retention_category_reviews;
CREATE POLICY mazi_retention_backend_select ON public.mazi_retention_category_reviews
 FOR SELECT TO bls_app_runtime,bls_platform_runtime USING (true);
DROP POLICY IF EXISTS mazi_retention_backend_insert ON public.mazi_retention_category_reviews;
CREATE POLICY mazi_retention_backend_insert ON public.mazi_retention_category_reviews
 FOR INSERT TO bls_app_runtime,bls_platform_runtime WITH CHECK (true);

COMMENT ON TABLE public.mazi_retention_category_reviews IS
 'Private append-only evidence of real per-category retention reviews. Human evidence does not automate deletion or certify legal compliance.';

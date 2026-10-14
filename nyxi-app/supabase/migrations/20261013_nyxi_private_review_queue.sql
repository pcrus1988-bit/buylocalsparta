-- NYXI — private review readiness. Safe preparatory migration.
-- Does NOT approve, publish, fetch, or expose a single evidence fragment.
-- Views require invoker permissions; only the service_role may SELECT them.
CREATE TABLE IF NOT EXISTS public.nyxi_reviewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'reviewer' CHECK (role IN ('reviewer','publisher')),
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text NOT NULL,
  disabled_at timestamptz,
  CONSTRAINT nyxi_reviewer_added_by_nonblank CHECK (length(trim(added_by)) >= 3)
);
ALTER TABLE public.nyxi_reviewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nyxi_reviewers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.nyxi_reviewers TO service_role;

CREATE OR REPLACE VIEW public.nyxi_private_review_queue_v1
WITH (security_invoker = true, security_barrier = true)
AS
WITH candidates AS (
 SELECT
    e.id AS fragment_id, e.source_id, e.snapshot_id,
    src.title AS source_title, src.authority, src.source_role,
    v.final_url AS official_source_url,
    v.fetched_at AS snapshot_fetched_at,
    v.sha256 AS snapshot_sha256,
    e.content_sha256 AS fragment_sha256, e.evidence_class,
    e.section_heading, e.ordinal,
    left(e.body_text, 1400) AS excerpt,
    length(trim(e.body_text)) AS text_length,
    row_number() OVER (
      PARTITION BY e.source_id, e.content_sha256
      ORDER BY v.fetched_at DESC, e.ordinal ASC, e.id ASC
    ) AS duplicate_rank,
    e.metadata->>'review_status' AS review_status,
    e.metadata->>'review_required' AS review_required,
    COALESCE(e.body_text ~* '(skip to main content|skip to footer|cookie preferences|navigation menu|all rights reserved)',false) AS probable_page_chrome
 FROM public.nyxi_evidence_fragments e
 JOIN public.nyxi_sources src ON src.id=e.source_id AND src.status='active'
 JOIN public.nyxi_valid_snapshots_v1 v ON v.snapshot_id=e.snapshot_id
      AND v.source_id=e.source_id AND v.latest_snapshot=true
 WHERE COALESCE(e.metadata->>'review_status','pending')='pending'
   AND COALESCE(e.metadata->>'review_required','true')='true'
   AND EXISTS (
     SELECT 1 FROM public.nyxi_extraction_runs r
     WHERE r.snapshot_id=e.snapshot_id
       AND r.source_id=e.source_id AND r.status='complete'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.nyxi_fragment_publication_approvals a
     WHERE a.fragment_id=e.id AND a.revoked_at IS NULL
   )
)
SELECT fragment_id, source_id, snapshot_id, source_title, authority, source_role,
       official_source_url, snapshot_fetched_at, snapshot_sha256, fragment_sha256,
       evidence_class, section_heading, ordinal, excerpt, text_length,
       review_status, review_required,
       CASE
         WHEN duplicate_rank>1 THEN 'duplicate_review'
         WHEN probable_page_chrome THEN 'page_chrome_review'
         WHEN text_length<90 THEN 'too_short_review'
         ELSE 'human_evidence_review'
       END AS quality_lane
FROM candidates;

CREATE OR REPLACE VIEW public.nyxi_private_review_readiness_v1
WITH (security_invoker = true, security_barrier = true)
AS SELECT
 count(*) AS pending_current_fragments,
 count(*) FILTER (WHERE quality_lane='human_evidence_review') AS human_review_candidates,
 count(*) FILTER (WHERE quality_lane='duplicate_review') AS possible_duplicates,
 count(*) FILTER (WHERE quality_lane='page_chrome_review') AS possible_page_chrome,
 count(*) FILTER (WHERE quality_lane='too_short_review') AS short_fragments,
 count(DISTINCT source_id) AS contributing_sources
FROM public.nyxi_private_review_queue_v1;

REVOKE ALL ON public.nyxi_private_review_queue_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.nyxi_private_review_readiness_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nyxi_private_review_queue_v1 TO service_role;
GRANT SELECT ON public.nyxi_private_review_readiness_v1 TO service_role;

COMMENT ON VIEW public.nyxi_private_review_queue_v1 IS
 'Restricted preliminary queue. No document is publishable without separately verified authorization and fragment approval.';
COMMENT ON TABLE public.nyxi_reviewers IS
 'Disabled by default: no reviewer membership until an existing, verified Supabase Auth identity is enrolled by the owner. No public RLS policies.';

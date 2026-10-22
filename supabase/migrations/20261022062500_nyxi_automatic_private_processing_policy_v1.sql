-- NYXI owner-directed automatic evidence processing, 2026-10-22.
-- Automated internal acceptance is NOT independent excerpt rights, medical/legal
-- validation, a publisher signature, or permission to disclose original source text.
-- The pre-existing public search remains fail-closed on separate publication rights.

CREATE TABLE IF NOT EXISTS public.nyxi_processing_policy_v1 (
  policy_key text PRIMARY KEY CHECK (policy_key='nyxi_default'),
  decision_mode text NOT NULL CHECK (decision_mode='automatic'),
  human_review_required boolean NOT NULL DEFAULT false CHECK (human_review_required=false),
  future_ingestion_automatic boolean NOT NULL DEFAULT true CHECK (future_ingestion_automatic=true),
  scope text NOT NULL CHECK (scope='private_evidence_processing'),
  public_excerpt_policy text NOT NULL CHECK (public_excerpt_policy='separate_provenance_and_rights_gate'),
  initiated_by text NOT NULL CHECK (length(btrim(initiated_by)) >= 12),
  policy_note text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nyxi_processing_policy_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nyxi_processing_policy_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_processing_policy_v1 TO service_role;
INSERT INTO public.nyxi_processing_policy_v1
  (policy_key,decision_mode,human_review_required,future_ingestion_automatic,
   scope,public_excerpt_policy,initiated_by,policy_note)
VALUES ('nyxi_default','automatic',false,true,
        'private_evidence_processing','separate_provenance_and_rights_gate',
        'NYXI owner instruction 2026-10-22',
        'Owner waived routine human item approval for current and future private NYXI processing. Automatic rights and content-quality checks determine downstream eligibility. Acquisition authorization does not grant excerpt publication, invent legal status, certify manufacturer identity, or license third-party material.')
ON CONFLICT (policy_key) DO NOTHING;

-- Computed rather than a one-time backfill. Every new fragment and snapshot
-- is automatically classified at SELECT time; no pending person/cron is needed.
CREATE OR REPLACE VIEW public.nyxi_automated_evidence_decisions_v1
WITH (security_invoker=true,security_barrier=true)
AS
WITH ranked AS (
 SELECT
   e.id AS fragment_id,e.source_id,e.snapshot_id,
   e.content_sha256 AS fragment_sha256,
   e.evidence_class,
   v.sha256 AS authorized_snapshot_sha256,
   v.final_url AS source_url,
   v.fetched_at AS authorized_fetched_at,
   e.created_at,
   length(btrim(e.body_text)) AS text_length,
   e.body_text ~* '(skip to main content|skip to footer|cookie preferences|navigation menu|all rights reserved)' AS probable_page_chrome,
   row_number() OVER (
      PARTITION BY e.source_id,e.content_sha256
      ORDER BY s.fetched_at DESC,e.ordinal,e.id
   ) AS duplicate_rank,
   EXISTS (
      SELECT 1 FROM public.nyxi_extraction_runs x
      WHERE x.source_id=e.source_id AND x.snapshot_id=e.snapshot_id
        AND x.status='complete'
   ) AS extraction_complete,
   src.status='active' AS source_active
 FROM public.nyxi_evidence_fragments e
 JOIN public.nyxi_source_snapshots s
   ON s.id=e.snapshot_id AND s.source_id=e.source_id
 JOIN public.nyxi_sources src ON src.id=e.source_id
 LEFT JOIN public.nyxi_valid_snapshots_v1 v
   ON v.snapshot_id=e.snapshot_id AND v.source_id=e.source_id
     AND v.latest_snapshot IS TRUE
)
SELECT
 fragment_id,source_id,snapshot_id,fragment_sha256,
 authorized_snapshot_sha256,source_url,authorized_fetched_at,created_at,
 evidence_class,text_length,
 CASE
   WHEN NOT source_active OR authorized_snapshot_sha256 IS NULL
     THEN 'withheld_invalid_or_stale_asset'
   WHEN NOT extraction_complete OR fragment_sha256 !~ '^[0-9a-f]{64}$'
     THEN 'withheld_incomplete_or_invalid_extraction'
   ELSE 'auto_approved_private'
 END AS decision,
 CASE
   WHEN duplicate_rank>1 THEN 'duplicate'
   WHEN probable_page_chrome THEN 'page_chrome'
   WHEN text_length<90 THEN 'too_short'
   ELSE 'substantive_text'
 END AS quality_class,
 CASE
   WHEN NOT source_active OR authorized_snapshot_sha256 IS NULL
        OR NOT extraction_complete OR fragment_sha256 !~ '^[0-9a-f]{64}$'
     THEN false
   WHEN duplicate_rank>1 OR probable_page_chrome OR text_length<90
     THEN false
   ELSE true
 END AS eligible_for_private_knowledge_extraction,
 false AS human_review_required,
 false AS public_excerpt_authorized
FROM ranked;

CREATE OR REPLACE VIEW public.nyxi_automated_processing_readiness_v1
WITH (security_invoker=true,security_barrier=true)
AS
SELECT count(*) AS total_fragments,
 count(*) FILTER (WHERE decision='auto_approved_private') AS auto_approved_private,
 count(*) FILTER (WHERE eligible_for_private_knowledge_extraction) AS usable_private,
 count(*) FILTER (WHERE decision='auto_approved_private'
                   AND NOT eligible_for_private_knowledge_extraction) AS accepted_with_quality_flags,
 count(*) FILTER (WHERE decision='withheld_invalid_or_stale_asset') AS withheld_rights_or_staleness,
 count(*) FILTER (WHERE decision='withheld_incomplete_or_invalid_extraction') AS withheld_extraction,
 count(*) FILTER (WHERE human_review_required) AS human_review_needed,
 count(*) FILTER (WHERE public_excerpt_authorized) AS public_excerpt_approved
FROM public.nyxi_automated_evidence_decisions_v1;

REVOKE ALL ON public.nyxi_automated_evidence_decisions_v1 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.nyxi_automated_processing_readiness_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_automated_evidence_decisions_v1 TO service_role;
GRANT SELECT ON public.nyxi_automated_processing_readiness_v1 TO service_role;
COMMENT ON VIEW public.nyxi_automated_evidence_decisions_v1 IS
 'Automatic current/future private-evidence acceptance based on existing exact-asset permission, current snapshot and extraction integrity; content QA auto-filters low-value text. NEVER permits excerpt publication.';
COMMENT ON VIEW public.nyxi_automated_processing_readiness_v1 IS
 'Dynamic owner-directed no-human-review internal evidence acceptance metrics; 0 public approvals by design.';

-- NYXI preliminary evidence triage: append-only, service-role-only.
-- THIS IS NOT publication approval. It cannot alter evidence, rights, or public search.
CREATE TABLE IF NOT EXISTS public.nyxi_fragment_triage_events_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  fragment_id uuid NOT NULL REFERENCES public.nyxi_evidence_fragments(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
  snapshot_id uuid NOT NULL REFERENCES public.nyxi_source_snapshots(id) ON DELETE RESTRICT,
  reviewer_user_id uuid NOT NULL,
  disposition text NOT NULL CHECK (disposition IN (
    'candidate_for_review','needs_rights_review','needs_source_check',
    'reject_bad_text','duplicate'
  )),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 20 AND 1000),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  fragment_sha256 text NOT NULL CHECK (fragment_sha256 ~ '^[0-9a-f]{64}$'),
  quality_lane text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nyxi_fragment_triage_idempotency UNIQUE (reviewer_user_id, request_id)
);
CREATE INDEX IF NOT EXISTS nyxi_fragment_triage_by_fragment
  ON public.nyxi_fragment_triage_events_v1(fragment_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS nyxi_fragment_triage_by_reviewer
  ON public.nyxi_fragment_triage_events_v1(reviewer_user_id, recorded_at DESC);
ALTER TABLE public.nyxi_fragment_triage_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nyxi_fragment_triage_events_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.nyxi_fragment_triage_events_v1 TO service_role;

-- Revoke even privileged write paths from ordinary Edge roles; preserve event history.
CREATE OR REPLACE FUNCTION public.nyxi_reject_triage_event_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'triage_events_are_append_only' USING ERRCODE = '42501';
END; $$;
DROP TRIGGER IF EXISTS nyxi_triage_event_immutable ON public.nyxi_fragment_triage_events_v1;
CREATE TRIGGER nyxi_triage_event_immutable BEFORE UPDATE OR DELETE
  ON public.nyxi_fragment_triage_events_v1
  FOR EACH ROW EXECUTE FUNCTION public.nyxi_reject_triage_event_mutation_v1();
REVOKE ALL ON FUNCTION public.nyxi_reject_triage_event_mutation_v1() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nyxi_record_fragment_triage_v1(
  p_actor_user_id uuid,
  p_fragment_id uuid,
  p_request_id uuid,
  p_disposition text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  candidate record;
  existing record;
  created_id uuid;
  clean_reason text;
BEGIN
  IF p_actor_user_id IS NULL OR p_fragment_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_triage_identity' USING ERRCODE = '22023';
  END IF;
  IF p_disposition IS NULL OR p_disposition NOT IN (
    'candidate_for_review','needs_rights_review','needs_source_check',
    'reject_bad_text','duplicate'
  ) THEN
    RAISE EXCEPTION 'invalid_triage_disposition' USING ERRCODE = '22023';
  END IF;
  clean_reason := btrim(p_reason);
  IF clean_reason IS NULL OR length(clean_reason) NOT BETWEEN 20 AND 1000
    OR clean_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_triage_reason' USING ERRCODE = '22023';
  END IF;

  -- Only current, explicitly authorized private snapshots; verifies reviewer still active.
  SELECT q.fragment_id,q.source_id,q.snapshot_id,q.snapshot_sha256,
         q.fragment_sha256,q.quality_lane
  INTO candidate
  FROM public.nyxi_private_review_queue_v1 q
  JOIN public.nyxi_reviewers r ON r.user_id=p_actor_user_id
     AND r.disabled_at IS NULL AND r.role IN ('reviewer','publisher')
  WHERE q.fragment_id=p_fragment_id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'triage_candidate_not_eligible' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.nyxi_fragment_triage_events_v1
    (request_id,fragment_id,source_id,snapshot_id,reviewer_user_id,
     disposition,reason,snapshot_sha256,fragment_sha256,quality_lane)
  VALUES
    (p_request_id,candidate.fragment_id,candidate.source_id,candidate.snapshot_id,p_actor_user_id,
     p_disposition,clean_reason,candidate.snapshot_sha256,candidate.fragment_sha256,candidate.quality_lane)
  ON CONFLICT (reviewer_user_id,request_id) DO NOTHING
  RETURNING id INTO created_id;

  IF created_id IS NULL THEN
    SELECT * INTO existing
    FROM public.nyxi_fragment_triage_events_v1
    WHERE reviewer_user_id=p_actor_user_id AND request_id=p_request_id;
    IF NOT FOUND OR existing.fragment_id IS DISTINCT FROM p_fragment_id
       OR existing.snapshot_id IS DISTINCT FROM candidate.snapshot_id
       OR existing.fragment_sha256 IS DISTINCT FROM candidate.fragment_sha256
       OR existing.disposition IS DISTINCT FROM p_disposition
       OR existing.reason IS DISTINCT FROM clean_reason THEN
      RAISE EXCEPTION 'triage_request_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('status','recorded','event_id',existing.id,'replayed',true,
                              'publication','none');
  END IF;
  RETURN jsonb_build_object('status','recorded','event_id',created_id,'replayed',false,
                            'publication','none');
END; $$;
REVOKE ALL ON FUNCTION public.nyxi_record_fragment_triage_v1(uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nyxi_record_fragment_triage_v1(uuid,uuid,uuid,text,text)
  TO service_role;

COMMENT ON TABLE public.nyxi_fragment_triage_events_v1 IS
  'Append-only private preliminary triage, NEVER an evidence rights or publication approval.';
COMMENT ON FUNCTION public.nyxi_record_fragment_triage_v1(uuid,uuid,uuid,text,text) IS
  'Service-role-only transaction checks latest valid candidate and live reviewer membership. No public approvals.';

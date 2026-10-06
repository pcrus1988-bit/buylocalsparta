-- KONTA MOY Retail Observatory — research/commercial boundary and linkage destruction.
-- Schema 0428 removes commercial marketing consent from the research consent
-- ledger and adds a governed, irreversible post-publication linkage-destruction
-- operation. Aggregate/release evidence survives; contact -> company -> response
-- linkage does not.

BEGIN;

ALTER TABLE public.research_consents
  DROP CONSTRAINT IF EXISTS research_consents_consent_kind_check;

ALTER TABLE public.research_consents
  ADD CONSTRAINT research_consents_consent_kind_check
  CHECK (consent_kind IN ('research_participation','results_notification','thank_you_code'));

ALTER TABLE public.research_responses
  ALTER COLUMN invite_id DROP NOT NULL;

ALTER TABLE public.research_participant_deliveries
  ALTER COLUMN contact_point_id DROP NOT NULL;

ALTER TABLE public.research_invite_messages
  ALTER COLUMN contact_point_id DROP NOT NULL;

CREATE TABLE public.research_linkage_destruction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  event_version text NOT NULL,
  actor text NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 4000),
  response_count integer NOT NULL CHECK (response_count >= 0),
  invite_count integer NOT NULL CHECK (invite_count >= 0),
  contact_point_count integer NOT NULL CHECK (contact_point_count >= 0),
  detached_invite_count integer NOT NULL CHECK (detached_invite_count >= 0),
  deleted_contact_point_count integer NOT NULL CHECK (deleted_contact_point_count >= 0),
  evidence_json jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id)
);

ALTER TABLE public.research_studies
  ADD COLUMN linkage_retention_until timestamptz,
  ADD COLUMN linkage_destroyed_at timestamptz,
  ADD COLUMN linkage_destruction_version text,
  ADD COLUMN linkage_destruction_event_id uuid
    REFERENCES public.research_linkage_destruction_events(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.research_destroy_study_linkage(
  p_study_id uuid,
  p_actor text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  v_study public.research_studies%ROWTYPE;
  v_event_id uuid;
  v_response_count integer;
  v_invite_count integer;
  v_contact_count integer;
  v_detached_invites integer := 0;
  v_deleted_contacts integer := 0;
  v_evidence jsonb;
  v_sha text;
BEGIN
  SELECT * INTO v_study
  FROM public.research_studies
  WHERE id=p_study_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'research study/wave not found';
  END IF;

  IF v_study.linkage_destruction_event_id IS NOT NULL THEN
    RETURN v_study.linkage_destruction_event_id;
  END IF;

  IF v_study.status NOT IN ('published','archived') THEN
    RAISE EXCEPTION 'research linkage may be destroyed only after publication';
  END IF;

  IF v_study.linkage_retention_until IS NULL THEN
    RAISE EXCEPTION 'research linkage retention policy has not been explicitly set';
  END IF;

  IF now() < v_study.linkage_retention_until THEN
    RAISE EXCEPTION 'research linkage retention period has not elapsed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.research_release_snapshots r
    WHERE r.study_id=p_study_id
      AND r.published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'research linkage destruction requires a published frozen release';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.research_participant_deliveries d
    WHERE d.study_id=p_study_id AND d.status='sending'
  ) OR EXISTS (
    SELECT 1
    FROM public.research_invite_messages m
    JOIN public.research_invites i ON i.id=m.invite_id
    WHERE i.study_id=p_study_id AND m.status='sending'
  ) THEN
    RAISE EXCEPTION 'research linkage destruction blocked while delivery is running';
  END IF;

  SELECT count(*)::int INTO v_response_count
  FROM public.research_responses
  WHERE study_id=p_study_id;

  SELECT count(*)::int INTO v_invite_count
  FROM public.research_invites
  WHERE study_id=p_study_id;

  SELECT count(*)::int INTO v_contact_count
  FROM public.research_contact_points cp
  JOIN public.research_frame_units fu ON fu.id=cp.frame_unit_id
  JOIN public.research_frame_snapshots fs ON fs.id=fu.frame_snapshot_id
  WHERE fs.study_id=p_study_id;

  UPDATE public.research_participant_deliveries
  SET status='cancelled',
      last_error=COALESCE(last_error,'linkage_destroyed_before_delivery'),
      updated_at=now()
  WHERE study_id=p_study_id
    AND status IN ('planned','failed');

  WITH cancelled AS (
    UPDATE public.research_invite_messages m
    SET status='cancelled',
        last_error=COALESCE(last_error,'linkage_destroyed_before_delivery'),
        updated_at=now()
    FROM public.research_invites i
    WHERE i.id=m.invite_id
      AND i.study_id=p_study_id
      AND m.status IN ('planned','failed')
    RETURNING m.id
  )
  SELECT count(*) FROM cancelled;

  UPDATE public.research_invite_access_tokens t
  SET status='revoked', revoked_at=COALESCE(revoked_at,now())
  FROM public.research_invites i
  WHERE i.id=t.invite_id
    AND i.study_id=p_study_id
    AND t.status='active';

  UPDATE public.research_participant_deliveries
  SET contact_point_id=NULL, updated_at=now()
  WHERE study_id=p_study_id
    AND contact_point_id IS NOT NULL;

  UPDATE public.research_invite_messages m
  SET contact_point_id=NULL, updated_at=now()
  FROM public.research_invites i
  WHERE i.id=m.invite_id
    AND i.study_id=p_study_id
    AND m.contact_point_id IS NOT NULL;

  UPDATE public.research_responses
  SET invite_id=NULL
  WHERE study_id=p_study_id
    AND invite_id IS NOT NULL;

  WITH detached AS (
    UPDATE public.research_invites
    SET sample_unit_id=NULL,
        contact_point_id=NULL,
        token_hash=encode(digest(id::text || ':' || gen_random_uuid()::text,'sha256'),'hex'),
        status=CASE WHEN status='suppressed' THEN 'suppressed' ELSE 'expired' END,
        expires_at=LEAST(COALESCE(expires_at,now()),now())
    WHERE study_id=p_study_id
    RETURNING id
  )
  SELECT count(*)::int INTO v_detached_invites FROM detached;

  WITH deleted AS (
    DELETE FROM public.research_contact_points cp
    USING public.research_frame_units fu, public.research_frame_snapshots fs
    WHERE cp.frame_unit_id=fu.id
      AND fu.frame_snapshot_id=fs.id
      AND fs.study_id=p_study_id
    RETURNING cp.id
  )
  SELECT count(*)::int INTO v_deleted_contacts FROM deleted;

  v_evidence := jsonb_build_object(
    'schema','kontamou.research.linkage-destruction.v1',
    'studyId',p_study_id,
    'responseCount',v_response_count,
    'inviteCount',v_invite_count,
    'contactPointCountBefore',v_contact_count,
    'detachedInviteCount',v_detached_invites,
    'deletedContactPointCount',v_deleted_contacts,
    'suppressionHashesRetained',true,
    'publishedAggregateEvidenceRetained',true,
    'rawInvitationTokenValidityDestroyed',true,
    'actor',p_actor,
    'reason',p_reason
  );

  v_sha := encode(digest(v_evidence::text,'sha256'),'hex');

  INSERT INTO public.research_linkage_destruction_events (
    study_id,event_version,actor,reason,response_count,invite_count,
    contact_point_count,detached_invite_count,deleted_contact_point_count,
    evidence_json,content_sha256
  ) VALUES (
    p_study_id,'kontamou.research.linkage-destruction.v1',p_actor,p_reason,
    v_response_count,v_invite_count,v_contact_count,v_detached_invites,
    v_deleted_contacts,v_evidence,v_sha
  )
  RETURNING id INTO v_event_id;

  UPDATE public.research_studies
  SET linkage_destroyed_at=now(),
      linkage_destruction_version='kontamou.research.linkage-destruction.v1',
      linkage_destruction_event_id=v_event_id,
      updated_at=now()
  WHERE id=p_study_id;

  RETURN v_event_id;
END;
$research$;

CREATE OR REPLACE FUNCTION public.research_guard_linkage_destruction_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  RAISE EXCEPTION 'research linkage destruction evidence is immutable';
END;
$research$;

CREATE TRIGGER research_linkage_destruction_events_immutable
BEFORE UPDATE OR DELETE ON public.research_linkage_destruction_events
FOR EACH ROW EXECUTE FUNCTION public.research_guard_linkage_destruction_event_mutation();

ALTER TABLE public.research_linkage_destruction_events ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_linkage_destruction_events FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_destroy_study_linkage(uuid,text,text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_linkage_destruction_event_mutation() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_linkage_destruction_events FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_destroy_study_linkage(uuid,text,text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_linkage_destruction_event_mutation() FROM authenticated;
  END IF;
END;
$research$;

REVOKE EXECUTE ON FUNCTION public.research_destroy_study_linkage(uuid,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_linkage_destruction_event_mutation() FROM PUBLIC;

GRANT SELECT,INSERT ON TABLE public.research_linkage_destruction_events TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_destroy_study_linkage(uuid,text,text) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_linkage_destruction_event_mutation() TO bls_platform_runtime;

CREATE POLICY research_linkage_destruction_events_platform_runtime
ON public.research_linkage_destruction_events
FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMENT ON TABLE public.research_linkage_destruction_events IS
  'Append-only proof that post-publication contact/company/response linkage was irreversibly detached.';
COMMENT ON FUNCTION public.research_destroy_study_linkage(uuid,text,text) IS
  'Irreversibly invalidates personal research links, detaches response-to-sample identity, deletes study contact points and preserves only aggregate/reproducibility evidence plus hash-only suppression state.';

COMMIT;

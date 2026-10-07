-- KONTA MOY — append-only protocol deviation and amendment evidence.
-- Schema 0426 makes study departures, amendments and resolutions first-class
-- research evidence that can be carried into immutable releases.

BEGIN;

CREATE TABLE public.research_protocol_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('deviation','amendment','resolution')),
  lifecycle_phase text NOT NULL CHECK (lifecycle_phase IN ('design','pilot','main','analysis','publication')),
  category text NOT NULL CHECK (category IN ('instrument','sampling','recruitment','fieldwork','privacy','analysis','publication','operations')),
  severity text NOT NULL CHECK (severity IN ('info','minor','material','critical')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 180),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 12000),
  rationale text,
  impact_assessment text,
  corrective_action text,
  related_event_id uuid REFERENCES public.research_protocol_events(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL CHECK (char_length(recorded_by) BETWEEN 1 AND 200),
  evidence_json jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (event_type <> 'resolution' OR related_event_id IS NOT NULL)
);

CREATE INDEX research_protocol_events_study_recorded_idx
  ON public.research_protocol_events(study_id, recorded_at DESC, id DESC);

CREATE INDEX research_protocol_events_related_idx
  ON public.research_protocol_events(related_event_id)
  WHERE related_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.research_guard_protocol_event_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  related_study_id uuid;
  related_event_type text;
BEGIN
  IF NEW.related_event_id IS NOT NULL THEN
    SELECT pe.study_id,pe.event_type
    INTO related_study_id,related_event_type
    FROM public.research_protocol_events pe
    WHERE pe.id=NEW.related_event_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'research protocol event reference does not exist';
    END IF;
    IF related_study_id IS DISTINCT FROM NEW.study_id THEN
      RAISE EXCEPTION 'research protocol event reference belongs to another study';
    END IF;
    IF NEW.event_type='resolution' AND related_event_type='resolution' THEN
      RAISE EXCEPTION 'research protocol resolution cannot resolve another resolution';
    END IF;
  END IF;

  RETURN NEW;
END;
$research$;

CREATE OR REPLACE FUNCTION public.research_guard_protocol_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  RAISE EXCEPTION 'research protocol evidence is immutable; append a new event instead';
END;
$research$;

CREATE TRIGGER research_protocol_events_insert_guard
BEFORE INSERT ON public.research_protocol_events
FOR EACH ROW EXECUTE FUNCTION public.research_guard_protocol_event_insert();

CREATE TRIGGER research_protocol_events_immutable
BEFORE UPDATE OR DELETE ON public.research_protocol_events
FOR EACH ROW EXECUTE FUNCTION public.research_guard_protocol_event_mutation();

ALTER TABLE public.research_protocol_events ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_protocol_events FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_protocol_event_insert() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_protocol_event_mutation() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_protocol_events FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_protocol_event_insert() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_protocol_event_mutation() FROM authenticated;
  END IF;
END;
$research$;

REVOKE EXECUTE ON FUNCTION public.research_guard_protocol_event_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_protocol_event_mutation() FROM PUBLIC;

GRANT SELECT, INSERT ON TABLE public.research_protocol_events TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_protocol_event_insert() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_protocol_event_mutation() TO bls_platform_runtime;

CREATE POLICY research_protocol_events_platform_runtime
ON public.research_protocol_events
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

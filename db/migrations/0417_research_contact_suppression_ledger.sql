-- KONTA MOY — cross-wave research contact suppression ledger.
-- Schema 415 ensures participant research opt-outs, SES complaints and bounces
-- survive frozen-frame rebuilds and future study waves without becoming
-- marketing consent or modifying historical research evidence.

BEGIN;

CREATE TABLE public.research_contact_suppression_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_type text NOT NULL CHECK (contact_type IN ('email','phone','postal','other')),
  contact_value_hash text NOT NULL CHECK (contact_value_hash ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK (action IN ('suppress','restore')),
  reason text NOT NULL CHECK (reason IN (
    'participant_research_opt_out',
    'ses_bounce',
    'ses_complaint',
    'invalid_contact',
    'manual',
    'correction'
  )),
  study_id uuid REFERENCES public.research_studies(id) ON DELETE SET NULL,
  invite_id uuid REFERENCES public.research_invites(id) ON DELETE SET NULL,
  source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_contact_suppression_lookup_idx
  ON public.research_contact_suppression_events
  (contact_type, contact_value_hash, occurred_at DESC, id DESC);

ALTER TABLE public.research_contact_suppression_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_contact_suppression_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_contact_suppression_events FROM authenticated;
  END IF;
END
$$;

GRANT SELECT, INSERT ON TABLE public.research_contact_suppression_events TO bls_platform_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.research_contact_suppression_events_id_seq TO bls_platform_runtime;

CREATE POLICY research_contact_suppression_events_platform_runtime
ON public.research_contact_suppression_events
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE TRIGGER research_contact_suppression_events_append_only
BEFORE UPDATE OR DELETE ON public.research_contact_suppression_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.research_contact_is_suppressed(
  p_contact_type text,
  p_contact_value_hash text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
  SELECT COALESCE((
    SELECT e.action = 'suppress'
    FROM public.research_contact_suppression_events e
    WHERE e.contact_type = p_contact_type
      AND e.contact_value_hash = p_contact_value_hash
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT 1
  ), false);
$research$;

GRANT EXECUTE ON FUNCTION public.research_contact_is_suppressed(text,text) TO bls_platform_runtime;

-- Preserve existing per-frame suppression evidence as the initial cross-wave
-- state. The newest source row wins only after later append-only events exist.
INSERT INTO public.research_contact_suppression_events (
  contact_type,
  contact_value_hash,
  action,
  reason,
  source,
  metadata,
  occurred_at
)
SELECT DISTINCT ON (cp.contact_type, cp.contact_value_hash)
  cp.contact_type,
  cp.contact_value_hash,
  'suppress',
  CASE
    WHEN cp.suppression_status = 'bounced' THEN 'ses_bounce'
    WHEN cp.suppression_status = 'invalid' THEN 'invalid_contact'
    ELSE 'manual'
  END,
  'schema_415_backfill',
  jsonb_build_object('previousSuppressionStatus', cp.suppression_status),
  cp.created_at
FROM public.research_contact_points cp
WHERE cp.suppression_status IN ('suppressed','invalid','bounced')
ORDER BY cp.contact_type, cp.contact_value_hash, cp.created_at DESC, cp.id DESC;

-- Apply the resulting state to all historical contact rows sharing the same
-- normalized hash. This prevents an older active copy from being re-used.
UPDATE public.research_contact_points cp
SET suppression_status = CASE
  WHEN cp.suppression_status = 'bounced' THEN 'bounced'
  ELSE 'suppressed'
END
WHERE public.research_contact_is_suppressed(cp.contact_type, cp.contact_value_hash);

COMMIT;

-- Applied directly to production Supabase as approved operational safety incident.
-- Historical audit-only SQL, not a canonical application migration.
-- To make permanent future portability, create the next numbered migration and checksum.
-- Safety pause requested 2026-10-15.
-- Retains research answers, consent receipts and existing reward entitlements.
-- Prevents any new reward_delivery job from becoming dispatchable while paused.
-- Re-enable ONLY with explicit study owner approval and after enabling
-- BLS_RESEARCH_THANK_YOU_DELIVERY_ENABLED in the web/worker runtime.
CREATE TABLE IF NOT EXISTS research_private.thank_you_delivery_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  paused boolean NOT NULL DEFAULT true,
  paused_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'owner_requested_stop_20261015'
);

ALTER TABLE research_private.thank_you_delivery_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON research_private.thank_you_delivery_control FROM PUBLIC, anon, authenticated;

INSERT INTO research_private.thank_you_delivery_control (singleton,paused,reason)
VALUES (true,true,'owner_requested_stop_20261015')
ON CONFLICT (singleton)
DO UPDATE SET paused=true,paused_at=now(),reason='owner_requested_stop_20261015';

CREATE OR REPLACE FUNCTION research_private.guard_thank_you_delivery_jobs()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NEW.job_type = 'reward_delivery'
     AND NEW.status IN ('queued','running')
     AND COALESCE(
       (SELECT paused FROM research_private.thank_you_delivery_control WHERE singleton=true),true
     )
  THEN
    NEW.status := 'cancelled';
    NEW.finished_at := now();
    NEW.error_message := 'RESEARCH_THANK_YOU_DELIVERY_PAUSED';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION research_private.guard_thank_you_delivery_jobs()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS research_reward_delivery_pause_guard ON public.research_study_jobs;
CREATE TRIGGER research_reward_delivery_pause_guard
  BEFORE INSERT OR UPDATE OF status ON public.research_study_jobs
  FOR EACH ROW EXECUTE FUNCTION research_private.guard_thank_you_delivery_jobs();

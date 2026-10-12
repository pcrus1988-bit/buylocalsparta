-- FISCAL 0021: bounded, outbound-only reconciliation of known alert provider IDs.
-- No unrelated Resend payloads, recipient data, or email bodies are persisted.
BEGIN;
ALTER TABLE public.fiscal_security_alert_delivery_events
  ADD COLUMN verification_source text NOT NULL DEFAULT 'signed_webhook'
    CHECK(verification_source IN ('signed_webhook','provider_api'));
ALTER TABLE public.fiscal_security_alert_delivery_events
  ALTER COLUMN provider_event_at DROP NOT NULL;
ALTER TABLE public.fiscal_security_alert_delivery_events
  ADD CONSTRAINT fiscal_alert_verified_timestamp_guard
    CHECK (
      (verification_source='signed_webhook' AND provider_event_at IS NOT NULL)
      OR (verification_source='provider_api' AND provider_event_at IS NULL)
    );
-- The original CHECK allows NULL for API status observations while still
-- bounding timestamps on signed webhook events.

CREATE TABLE public.fiscal_security_alert_reconciliation (
 outbox_id uuid PRIMARY KEY REFERENCES public.fiscal_security_alert_outbox(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'pending'
  CHECK(state IN ('pending','checking','complete','exhausted')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 12),
 next_attempt_at timestamptz NOT NULL DEFAULT (now()+interval '2 minutes'),
 lease_until timestamptz,
 lease_token_hash char(64) CHECK(lease_token_hash IS NULL OR lease_token_hash ~ '^[a-f0-9]{64}$'),
 last_checked_at timestamptz,
 last_observed_event text CHECK(last_observed_event IS NULL OR last_observed_event IN
    ('sent','delivered','delivery_delayed','bounced','complained','failed','suppressed','unknown')),
 last_error_code text CHECK(last_error_code IS NULL OR last_error_code ~ '^[A-Z_]{3,60}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='checking' AND lease_until IS NOT NULL AND lease_token_hash IS NOT NULL)
    OR (state<>'checking' AND lease_until IS NULL AND lease_token_hash IS NULL))
);
CREATE INDEX fiscal_security_alert_reconcile_due_idx
 ON public.fiscal_security_alert_reconciliation(next_attempt_at,outbox_id)
 WHERE state IN ('pending','checking');

CREATE FUNCTION public.fiscal_security_alert_reconciliation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Alert reconciliation records cannot be deleted'; END IF;
 IF NEW.outbox_id IS DISTINCT FROM OLD.outbox_id OR
   NEW.created_at IS DISTINCT FROM OLD.created_at OR
   OLD.state IN ('complete','exhausted') OR
   NOT ((OLD.state='pending' AND NEW.state IN ('checking','exhausted')) OR
        (OLD.state='checking' AND NEW.state IN ('pending','complete','exhausted'))) OR
   NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1
 THEN
  RAISE EXCEPTION 'Invalid security alert reconciliation transition';
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_security_alert_reconciliation_guard_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_security_alert_reconciliation
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_security_alert_reconciliation_guard();

ALTER TABLE public.fiscal_security_alert_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_security_alert_reconciliation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_security_alert_reconciliation_guard() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_security_alert_reconciliation FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.fiscal_security_alert_reconciliation_guard() FROM %I',r);
 END LOOP;
END $$;
COMMIT;

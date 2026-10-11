-- FISCAL 0019: independent, operator-verified security alert contacts and durable outbox.
-- No user-facing contact registration. Delivery and recovery remain separately gated.
BEGIN;

CREATE TABLE public.fiscal_security_alert_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 audience text NOT NULL CHECK(audience IN ('soc','account_owner')),
 actor_kind text CHECK(actor_kind IN ('marketplace_super_admin','fiscal_admin')),
 actor_ref text CHECK(actor_ref IS NULL OR length(actor_ref) BETWEEN 5 AND 160),
 recipient_email text NOT NULL CHECK(length(recipient_email) BETWEEN 6 AND 254
   AND recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+),
 verified_at timestamptz NOT NULL,
 verified_by text NOT NULL CHECK(length(verified_by) BETWEEN 5 AND 160),
 verification_method text NOT NULL CHECK(verification_method IN ('independent_offline_callback','organization_security_registry')),
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CHECK((audience='soc' AND actor_kind IS NULL AND actor_ref IS NULL)
   OR (audience='account_owner' AND actor_kind IS NOT NULL AND actor_ref IS NOT NULL)),
 CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE UNIQUE INDEX fiscal_security_alert_one_soc_idx
 ON public.fiscal_security_alert_contacts(audience) WHERE audience='soc' AND revoked_at IS NULL;
CREATE UNIQUE INDEX fiscal_security_alert_one_owner_idx
 ON public.fiscal_security_alert_contacts(actor_kind,actor_ref)
 WHERE audience='account_owner' AND revoked_at IS NULL;

CREATE TABLE public.fiscal_security_alert_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.fiscal_mfa_recovery_cases(id) ON DELETE RESTRICT,
 contact_id uuid NOT NULL REFERENCES public.fiscal_security_alert_contacts(id) ON DELETE RESTRICT,
 event_code text NOT NULL CHECK(event_code IN
   ('requested','approval_recorded','completed','cancelled')),
 event_ref uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','provider_accepted','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token_hash char(64) CHECK(lease_token_hash IS NULL OR lease_token_hash ~ '^[a-f0-9]{64}$'),
 provider_message_id text CHECK(provider_message_id IS NULL OR length(provider_message_id) BETWEEN 4 AND 160),
 provider_accepted_at timestamptz,
 last_attempt_at timestamptz,
 last_error_code text CHECK(last_error_code IS NULL OR last_error_code ~ '^[A-Z_]{3,60}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_id,event_code,event_ref,contact_id),
 CHECK((status='sending' AND lease_until IS NOT NULL AND lease_token_hash IS NOT NULL) OR
   (status<>'sending' AND lease_until IS NULL AND lease_token_hash IS NULL)),
 CHECK((status='provider_accepted' AND provider_accepted_at IS NOT NULL AND provider_message_id IS NOT NULL)
    OR (status<>'provider_accepted' AND provider_accepted_at IS NULL AND provider_message_id IS NULL))
);
CREATE INDEX fiscal_security_alert_outbox_work_idx
 ON public.fiscal_security_alert_outbox(next_attempt_at,created_at,id)
 WHERE status IN ('pending','sending');

CREATE FUNCTION public.fiscal_security_alert_contact_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Security notification contacts cannot be deleted'; END IF;
 IF (NEW.id,NEW.audience,NEW.actor_kind,NEW.actor_ref,NEW.recipient_email,
     NEW.verified_at,NEW.verified_by,NEW.verification_method,NEW.created_at)
    IS DISTINCT FROM
    (OLD.id,OLD.audience,OLD.actor_kind,OLD.actor_ref,OLD.recipient_email,
     OLD.verified_at,OLD.verified_by,OLD.verification_method,OLD.created_at)
    OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
 THEN RAISE EXCEPTION 'Security notification contacts are immutable except one-way revocation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_security_alert_contact_guard_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_security_alert_contacts
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_security_alert_contact_guard();

CREATE FUNCTION public.fiscal_security_alert_outbox_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Security outbox records cannot be deleted'; END IF;
 IF (NEW.id,NEW.case_id,NEW.contact_id,NEW.event_code,NEW.event_ref,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.case_id,OLD.contact_id,OLD.event_code,OLD.event_ref,OLD.created_at)
    OR OLD.status IN ('provider_accepted','dead')
    OR NOT (
     (OLD.status='pending' AND NEW.status IN ('sending','dead')) OR
     (OLD.status='sending' AND NEW.status IN ('pending','provider_accepted','dead'))
    )
    OR NEW.attempts < OLD.attempts OR NEW.attempts>OLD.attempts+1
 THEN RAISE EXCEPTION 'Invalid security alert delivery transition'; END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_security_alert_outbox_guard_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_security_alert_outbox
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_security_alert_outbox_guard();

ALTER TABLE public.fiscal_security_alert_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_security_alert_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_security_alert_contacts,public.fiscal_security_alert_outbox FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_security_alert_contact_guard(),public.fiscal_security_alert_outbox_guard() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_security_alert_contacts,public.fiscal_security_alert_outbox FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.fiscal_security_alert_contact_guard(),public.fiscal_security_alert_outbox_guard() FROM %I',r);
 END LOOP;
END $$;
COMMIT;
),
 verified_at timestamptz NOT NULL,
 verified_by text NOT NULL CHECK(length(verified_by) BETWEEN 5 AND 160),
 verification_method text NOT NULL CHECK(verification_method IN ('independent_offline_callback','organization_security_registry')),
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CHECK((audience='soc' AND actor_kind IS NULL AND actor_ref IS NULL)
   OR (audience='account_owner' AND actor_kind IS NOT NULL AND actor_ref IS NOT NULL)),
 CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE UNIQUE INDEX fiscal_security_alert_one_soc_idx
 ON public.fiscal_security_alert_contacts(audience) WHERE audience='soc' AND revoked_at IS NULL;
CREATE UNIQUE INDEX fiscal_security_alert_one_owner_idx
 ON public.fiscal_security_alert_contacts(actor_kind,actor_ref)
 WHERE audience='account_owner' AND revoked_at IS NULL;

CREATE TABLE public.fiscal_security_alert_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.fiscal_mfa_recovery_cases(id) ON DELETE RESTRICT,
 contact_id uuid NOT NULL REFERENCES public.fiscal_security_alert_contacts(id) ON DELETE RESTRICT,
 event_code text NOT NULL CHECK(event_code IN
   ('requested','approval_recorded','completed','cancelled')),
 event_ref uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','provider_accepted','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token_hash char(64) CHECK(lease_token_hash IS NULL OR lease_token_hash ~ '^[a-f0-9]{64}$'),
 provider_message_id text CHECK(provider_message_id IS NULL OR length(provider_message_id) BETWEEN 4 AND 160),
 provider_accepted_at timestamptz,
 last_attempt_at timestamptz,
 last_error_code text CHECK(last_error_code IS NULL OR last_error_code ~ '^[A-Z_]{3,60}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_id,event_code,event_ref,contact_id),
 CHECK((status='sending' AND lease_until IS NOT NULL AND lease_token_hash IS NOT NULL) OR
   (status<>'sending' AND lease_until IS NULL AND lease_token_hash IS NULL)),
 CHECK((status='provider_accepted' AND provider_accepted_at IS NOT NULL AND provider_message_id IS NOT NULL)
    OR (status<>'provider_accepted' AND provider_accepted_at IS NULL AND provider_message_id IS NULL))
);
CREATE INDEX fiscal_security_alert_outbox_work_idx
 ON public.fiscal_security_alert_outbox(next_attempt_at,created_at,id)
 WHERE status IN ('pending','sending');

CREATE FUNCTION public.fiscal_security_alert_contact_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Security notification contacts cannot be deleted'; END IF;
 IF (NEW.id,NEW.audience,NEW.actor_kind,NEW.actor_ref,NEW.recipient_email,
     NEW.verified_at,NEW.verified_by,NEW.verification_method,NEW.created_at)
    IS DISTINCT FROM
    (OLD.id,OLD.audience,OLD.actor_kind,OLD.actor_ref,OLD.recipient_email,
     OLD.verified_at,OLD.verified_by,OLD.verification_method,OLD.created_at)
    OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
 THEN RAISE EXCEPTION 'Security notification contacts are immutable except one-way revocation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_security_alert_contact_guard_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_security_alert_contacts
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_security_alert_contact_guard();

CREATE FUNCTION public.fiscal_security_alert_outbox_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Security outbox records cannot be deleted'; END IF;
 IF (NEW.id,NEW.case_id,NEW.contact_id,NEW.event_code,NEW.event_ref,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.case_id,OLD.contact_id,OLD.event_code,OLD.event_ref,OLD.created_at)
    OR OLD.status IN ('provider_accepted','dead')
    OR NOT (
     (OLD.status='pending' AND NEW.status IN ('sending','dead')) OR
     (OLD.status='sending' AND NEW.status IN ('pending','provider_accepted','dead'))
    )
    OR NEW.attempts < OLD.attempts OR NEW.attempts>OLD.attempts+1
 THEN RAISE EXCEPTION 'Invalid security alert delivery transition'; END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_security_alert_outbox_guard_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_security_alert_outbox
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_security_alert_outbox_guard();

ALTER TABLE public.fiscal_security_alert_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_security_alert_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_security_alert_contacts,public.fiscal_security_alert_outbox FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_security_alert_contact_guard(),public.fiscal_security_alert_outbox_guard() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_security_alert_contacts,public.fiscal_security_alert_outbox FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.fiscal_security_alert_contact_guard(),public.fiscal_security_alert_outbox_guard() FROM %I',r);
 END LOOP;
END $$;
COMMIT;

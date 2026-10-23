-- MAZI / 015: public business INTEREST, never MAZI membership registration.
-- Legal entities apply with ΑΦΜ, registry facts come from KONTA MOY's authorized
-- GEMI adapter. All PII is denied to PostgREST browser identities.
CREATE TABLE public.mazi_interest_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tax_number text NOT NULL UNIQUE CHECK(tax_number ~ '^[0-9]{9}$'),
 gemi_number text CHECK(gemi_number IS NULL OR gemi_number ~ '^[0-9]{12}$'),
 registry_legal_name text,
 registry_company_status text,
 registry_legal_type text,
 registry_city text,
 registry_checked_at timestamptz,
 registry_lookup_status text NOT NULL CHECK(registry_lookup_status IN ('matched','not_found','unavailable')),
 registry_was_cached boolean NOT NULL DEFAULT false,
 representative_name text NOT NULL CHECK (char_length(representative_name) BETWEEN 3 AND 120),
 contact_email text NOT NULL CHECK(char_length(contact_email) BETWEEN 5 AND 254),
 application_note text NOT NULL CHECK(char_length(application_note) BETWEEN 20 AND 1200),
 processing_notice_version text NOT NULL CHECK(processing_notice_version='mazi-afm-interest-v1'),
 processing_notice_accepted_at timestamptz NOT NULL DEFAULT now(),
 accuracy_confirmed boolean NOT NULL CHECK(accuracy_confirmed IS TRUE),
 status text NOT NULL CHECK(status IN ('pending_review','registry_review_required','approved_pending_invite','declined')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES public.users(id),
 review_reason text,
 representation_verified_at timestamptz,
 business_contact_verified_at timestamptz,
 CONSTRAINT mazi_afm_interest_review_complete CHECK(
  (reviewed_at IS NULL AND reviewed_by IS NULL AND review_reason IS NULL)
  OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND char_length(review_reason) BETWEEN 20 AND 1000)
 ),
 CONSTRAINT mazi_afm_interest_approved_guard CHECK (
  status <> 'approved_pending_invite'
  OR (registry_lookup_status='matched' AND gemi_number IS NOT NULL
   AND registry_checked_at IS NOT NULL AND reviewed_at IS NOT NULL
   AND representation_verified_at IS NOT NULL AND business_contact_verified_at IS NOT NULL)
 )
);
CREATE INDEX mazi_interest_queue_idx ON public.mazi_interest_applications(status,submitted_at);
ALTER TABLE public.mazi_interest_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_interest_applications FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.mazi_interest_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 interest_id uuid NOT NULL REFERENCES public.mazi_interest_applications(id),
 action text NOT NULL CHECK (action IN ('review_approved','review_declined')),
 actor_id uuid NOT NULL REFERENCES public.users(id),
 detail text NOT NULL CHECK(char_length(detail) BETWEEN 20 AND 1000),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mazi_interest_events_lookup_idx ON public.mazi_interest_events(interest_id,recorded_at DESC);
ALTER TABLE public.mazi_interest_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_interest_events FROM PUBLIC,anon,authenticated,service_role;

-- Historical application facts, public-provided contact and review log are
-- append-only; these existing public prospects are not auth users or members.
CREATE FUNCTION mazi_private.guard_public_interest_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tax_number IS DISTINCT FROM OLD.tax_number
    OR NEW.representative_name IS DISTINCT FROM OLD.representative_name
    OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
    OR NEW.application_note IS DISTINCT FROM OLD.application_note
    OR NEW.registry_lookup_status IS DISTINCT FROM OLD.registry_lookup_status
    OR NEW.gemi_number IS DISTINCT FROM OLD.gemi_number
    OR NEW.registry_legal_name IS DISTINCT FROM OLD.registry_legal_name
    OR NEW.registry_company_status IS DISTINCT FROM OLD.registry_company_status
    OR NEW.registry_checked_at IS DISTINCT FROM OLD.registry_checked_at
    OR NEW.processing_notice_version IS DISTINCT FROM OLD.processing_notice_version
    OR NEW.processing_notice_accepted_at IS DISTINCT FROM OLD.processing_notice_accepted_at
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
   RAISE EXCEPTION 'MAZI_INTEREST_IDENTITY_IMMUTABLE';
 END IF;
 IF OLD.status <> 'pending_review' AND OLD.status <> 'registry_review_required' THEN
   RAISE EXCEPTION 'MAZI_INTEREST_DECISION_FINAL';
 END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION mazi_private.guard_public_interest_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_guard_interest_identity
 BEFORE UPDATE ON public.mazi_interest_applications FOR EACH ROW
 EXECUTE FUNCTION mazi_private.guard_public_interest_identity();

CREATE FUNCTION mazi_private.guard_public_interest_events()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI_INTEREST_EVENT_IMMUTABLE';
END;$$;
REVOKE ALL ON FUNCTION mazi_private.guard_public_interest_events() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_guard_interest_events
 BEFORE UPDATE OR DELETE ON public.mazi_interest_events FOR EACH ROW
 EXECUTE FUNCTION mazi_private.guard_public_interest_events();

COMMENT ON TABLE public.mazi_interest_applications IS
 'Private unauthenticated expression-of-interest intake. Approval is NOT membership or an invitation; only an independently validated invite can later create member access.';

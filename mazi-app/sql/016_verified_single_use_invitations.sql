-- MAZI 016: invitation-only admission. NO financial activation, no synthetic users.
-- Supabase Auth's one-use invite email verifies control of the individually
-- approved address. The database admits the verified legal entity only after
-- a separate affirmative member onboarding acceptance.
CREATE TABLE public.mazi_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 interest_id uuid NOT NULL REFERENCES public.mazi_interest_applications(id),
 recipient_email text NOT NULL CHECK (
  recipient_email=lower(btrim(recipient_email)) AND char_length(recipient_email) BETWEEN 5 AND 254
 ),
 recipient_gemi_number text NOT NULL CHECK (recipient_gemi_number ~ '^[0-9]{12}$'),
 status text NOT NULL DEFAULT 'pending_delivery' CHECK (
  status IN ('pending_delivery','email_sent','delivery_failed','consumed','revoked')
 ),
 issued_by uuid NOT NULL REFERENCES public.users(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 emailed_at timestamptz,
 consumed_at timestamptz,
 consumed_by uuid REFERENCES auth.users(id),
 last_delivery_error text,
 terms_version text NOT NULL DEFAULT 'mazi-invitation-terms-v1'
  CHECK(terms_version='mazi-invitation-terms-v1'),
 CONSTRAINT mazi_invitation_time CHECK (expires_at>issued_at),
 CONSTRAINT mazi_invitation_consumed_consistent CHECK (
   (status='consumed' AND consumed_at IS NOT NULL AND consumed_by IS NOT NULL)
   OR (status<>'consumed' AND consumed_at IS NULL AND consumed_by IS NULL)
 ),
 CONSTRAINT mazi_invitation_delivery_consistent CHECK (
   (status IN ('email_sent','consumed') AND emailed_at IS NOT NULL)
   OR (status NOT IN ('email_sent','consumed'))
 )
);
CREATE UNIQUE INDEX mazi_one_live_invite_per_business
 ON public.mazi_invitations(interest_id)
 WHERE status IN ('pending_delivery','email_sent');
CREATE INDEX mazi_invites_recipient_status_idx
 ON public.mazi_invitations(recipient_email,status,expires_at DESC);
ALTER TABLE public.mazi_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_invitations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.mazi_invitations TO service_role;
-- The JWT-verifying Edge gateway may read only these reviewed contact facts;
-- ordinary PostgREST clients still have no access to either table.
GRANT SELECT (id,contact_email,status,registry_legal_name,gemi_number)
 ON public.mazi_interest_applications TO service_role;

CREATE TABLE public.mazi_invitation_acceptances (
 invitation_id uuid PRIMARY KEY REFERENCES public.mazi_invitations(id),
 accepted_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
 terms_version text NOT NULL CHECK(terms_version='mazi-invitation-terms-v1'),
 charter_accepted boolean NOT NULL CHECK(charter_accepted=true),
 processing_notice_accepted boolean NOT NULL CHECK(processing_notice_accepted=true),
 accepted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mazi_invitation_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_invitation_acceptances FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.mazi_invitation_acceptances TO service_role;

CREATE FUNCTION mazi_private.guard_invitation_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI_INVITATION_ACCEPTANCE_IMMUTABLE';
END;$$;
REVOKE ALL ON FUNCTION mazi_private.guard_invitation_acceptance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_invitation_acceptance_immutable
 BEFORE UPDATE OR DELETE ON public.mazi_invitation_acceptances
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_invitation_acceptance();

CREATE FUNCTION mazi_private.guard_invitation_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MAZI_INVITATION_IMMUTABLE'; END IF;
 IF NEW.interest_id IS DISTINCT FROM OLD.interest_id
    OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
    OR NEW.recipient_gemi_number IS DISTINCT FROM OLD.recipient_gemi_number
    OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.terms_version IS DISTINCT FROM OLD.terms_version THEN
  RAISE EXCEPTION 'MAZI_INVITATION_IDENTITY_IMMUTABLE';
 END IF;
 IF NOT (
     (OLD.status='pending_delivery' AND NEW.status IN ('email_sent','delivery_failed','revoked'))
     OR (OLD.status='email_sent' AND NEW.status IN ('consumed','revoked'))
     OR (OLD.status=NEW.status AND OLD.status IN ('pending_delivery','delivery_failed'))
 ) THEN RAISE EXCEPTION 'MAZI_INVITATION_TRANSITION_FORBIDDEN'; END IF;
 IF NEW.status='consumed' AND NOT EXISTS(
   SELECT 1 FROM public.mazi_invitation_acceptances a
   WHERE a.invitation_id=NEW.id AND a.accepted_user_id=NEW.consumed_by
 ) THEN RAISE EXCEPTION 'MAZI_INVITATION_ACCEPTANCE_REQUIRED'; END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION mazi_private.guard_invitation_transition() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_invitation_guard
 BEFORE UPDATE OR DELETE ON public.mazi_invitations
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_invitation_transition();

-- Only the service role can call this narrow privileged RPC through the
-- JWT-verifying MAZI Edge API. NEVER grant to anon or authenticated clients.
-- Email ownership comes from auth.users.email_confirmed_at; user_metadata
-- never participates in authorization. Locks and uniqueness serialize races.
CREATE FUNCTION public.mazi_complete_invitation(
 p_invitation_id uuid,
 p_user_id uuid,
 p_terms_version text,
 p_accept_charter boolean,
 p_accept_processing boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v record;
 v_auth record;
 v_application uuid;
BEGIN
 IF p_accept_charter IS DISTINCT FROM true
    OR p_accept_processing IS DISTINCT FROM true
    OR p_terms_version IS DISTINCT FROM 'mazi-invitation-terms-v1'
    OR p_user_id IS NULL OR p_invitation_id IS NULL THEN
  RAISE EXCEPTION 'MAZI_INVITATION_TERMS_REQUIRED';
 END IF;

 SELECT i.id,i.status AS invitation_status,i.expires_at,i.terms_version,
        i.recipient_email,i.recipient_gemi_number,
        a.id AS interest_id,a.status AS interest_status,a.registry_legal_name,
        a.registry_city,a.registry_legal_type,a.application_note,
        a.representative_name,a.gemi_number,a.registry_lookup_status,
        a.reviewed_at,a.reviewed_by,a.review_reason,
        a.representation_verified_at,a.business_contact_verified_at,
        a.company_active_verified_at
 INTO v
 FROM public.mazi_invitations i
 JOIN public.mazi_interest_applications a ON a.id=i.interest_id
 WHERE i.id=p_invitation_id
 FOR UPDATE OF i,a;
 IF NOT FOUND OR v.invitation_status<>'email_sent'
    OR v.expires_at<=pg_catalog.now()
    OR v.terms_version<>p_terms_version
    OR v.interest_status<>'approved_pending_invite'
    OR v.registry_lookup_status<>'matched'
    OR v.gemi_number IS DISTINCT FROM v.recipient_gemi_number
    OR v.reviewed_by IS NULL OR v.reviewed_at IS NULL
    OR v.representation_verified_at IS NULL
    OR v.business_contact_verified_at IS NULL
    OR v.company_active_verified_at IS NULL THEN
  RAISE EXCEPTION 'MAZI_INVITATION_NOT_ELIGIBLE';
 END IF;

 SELECT u.id,u.email,u.email_confirmed_at,u.deleted_at
 INTO v_auth FROM auth.users u WHERE u.id=p_user_id FOR SHARE;
 IF NOT FOUND OR v_auth.deleted_at IS NOT NULL
    OR v_auth.email_confirmed_at IS NULL
    OR lower(btrim(v_auth.email))<>v.recipient_email THEN
  RAISE EXCEPTION 'MAZI_INVITATION_EMAIL_NOT_VERIFIED';
 END IF;
 IF EXISTS (SELECT 1 FROM public.mazi_members m WHERE m.user_id=p_user_id)
    OR EXISTS (SELECT 1 FROM public.mazi_membership_applications a
                WHERE a.applicant_user_id=p_user_id)
    OR EXISTS (SELECT 1 FROM public.mazi_members m
                WHERE left(m.gemi_number,9)=left(v.gemi_number,9)) THEN
  RAISE EXCEPTION 'MAZI_INVITATION_ALREADY_MEMBER';
 END IF;

 INSERT INTO public.mazi_membership_applications (
  applicant_user_id,business_name,representative_name,location,
  sector,registry_number,description,consent_version,consent_at,
  status,reviewed_at,reviewed_by,review_reason
 ) VALUES (
  p_user_id,LEFT(v.registry_legal_name,160),v.representative_name,
  LEFT(COALESCE(NULLIF(btrim(v.registry_city),''),'Μη δηλωμένη'),120),
  LEFT(COALESCE(NULLIF(btrim(v.registry_legal_type),''),'Μη δηλωμένος'),100),
  v.gemi_number,v.application_note,'mazi-interest-v1',pg_catalog.now(),
  'approved',v.reviewed_at,v.reviewed_by,v.review_reason
 ) RETURNING id INTO v_application;

 INSERT INTO public.mazi_members(
  user_id,application_id,status,voting_eligible,
  gemi_number,identity_verified_at,identity_verified_by,identity_verification_note
 ) VALUES(
  p_user_id,v_application,'verified',false,
  v.gemi_number,v.company_active_verified_at,v.reviewed_by,v.review_reason
 );

 INSERT INTO public.mazi_invitation_acceptances(
  invitation_id,accepted_user_id,terms_version,charter_accepted,processing_notice_accepted
 ) VALUES(p_invitation_id,p_user_id,p_terms_version,true,true);

 UPDATE public.mazi_invitations
 SET status='consumed',consumed_at=pg_catalog.now(),consumed_by=p_user_id
 WHERE id=p_invitation_id AND status='email_sent';

 INSERT INTO public.mazi_audit_events(actor_user_id,marketplace_actor_user_id,
    entity_type,entity_id,action,evidence)
 VALUES(p_user_id,v.reviewed_by,'membership_invitation',p_invitation_id,
    'accepted',pg_catalog.jsonb_build_object(
       'terms_version',p_terms_version,'verified_gemi',v.gemi_number,
       'source','supabase_invite_verified_email','financial_rights',false));

 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mazi_complete_invitation(uuid,uuid,text,boolean,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mazi_complete_invitation(uuid,uuid,text,boolean,boolean)
 TO service_role;
COMMENT ON FUNCTION public.mazi_complete_invitation(uuid,uuid,text,boolean,boolean)
 IS 'Service-only transactional admission after separately verified invitation email and affirmative nonfinancial terms; never creates billing or voting entitlements.';

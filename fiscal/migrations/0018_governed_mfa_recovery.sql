-- FISCAL 0018: opt-in, offline-attested, two-independent-super-admin MFA recovery.
-- No direct browser grants; the feature remains disabled until separately reviewed.
BEGIN;

CREATE TABLE public.fiscal_mfa_recovery_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 target_kind text NOT NULL CHECK(target_kind IN ('marketplace_super_admin','fiscal_admin')),
 target_ref text NOT NULL CHECK(length(target_ref) BETWEEN 5 AND 160),
 evidence_ref text NOT NULL CHECK(evidence_ref ~ '^REC-[A-Z0-9-]{8,60}$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','cancelled','expired')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
 closed_at timestamptz,
 FOREIGN KEY(target_kind,target_ref) REFERENCES public.fiscal_operator_mfa_factors(actor_kind,actor_ref) ON DELETE RESTRICT,
 CHECK(expires_at>requested_at AND expires_at<=requested_at+interval '24 hours'),
 CHECK((state='pending' AND closed_at IS NULL) OR (state<>'pending' AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX fiscal_mfa_recovery_pending_target_idx
 ON public.fiscal_mfa_recovery_cases(target_kind,target_ref) WHERE state='pending';
CREATE INDEX fiscal_mfa_recovery_state_recent_idx
 ON public.fiscal_mfa_recovery_cases(state,requested_at DESC,id DESC);

CREATE TABLE public.fiscal_mfa_recovery_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.fiscal_mfa_recovery_cases(id) ON DELETE RESTRICT,
 approver_kind text NOT NULL DEFAULT 'marketplace_super_admin' CHECK(approver_kind='marketplace_super_admin'),
 approver_ref text NOT NULL CHECK(length(approver_ref) BETWEEN 5 AND 160),
 evidence_ref text NOT NULL CHECK(evidence_ref ~ '^REC-[A-Z0-9-]{8,60}$'),
 attested_offline_identity boolean NOT NULL CHECK(attested_offline_identity),
 approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_id,approver_kind,approver_ref)
);
CREATE INDEX fiscal_mfa_recovery_approvals_case_idx
 ON public.fiscal_mfa_recovery_approvals(case_id,approved_at DESC,id DESC);

CREATE FUNCTION public.fiscal_mfa_recovery_case_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MFA recovery cases cannot be deleted'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.target_kind IS DISTINCT FROM OLD.target_kind
    OR NEW.target_ref IS DISTINCT FROM OLD.target_ref OR NEW.evidence_ref IS DISTINCT FROM OLD.evidence_ref
    OR NEW.requested_at IS DISTINCT FROM OLD.requested_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR OLD.state<>'pending' OR NEW.state='pending' THEN
   RAISE EXCEPTION 'MFA recovery case identity and closed states are immutable';
 END IF;
 -- A privileged application bug cannot mark a case completed with one vote.
 -- Approval rows are immutable and UNIQUE per independent marketplace actor.
 IF NEW.state='completed' THEN
   IF OLD.expires_at<=now() OR
     (SELECT count(*) FROM public.fiscal_mfa_recovery_approvals a
      WHERE a.case_id=OLD.id AND a.approver_kind='marketplace_super_admin'
        AND a.attested_offline_identity=true AND a.evidence_ref=OLD.evidence_ref
        AND NOT (OLD.target_kind='marketplace_super_admin' AND a.approver_ref=OLD.target_ref))<>2
   THEN
     RAISE EXCEPTION 'MFA recovery completion requires exactly two independent approvals';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_mfa_recovery_case_guard
 BEFORE UPDATE OR DELETE ON public.fiscal_mfa_recovery_cases
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_mfa_recovery_case_integrity();

CREATE FUNCTION public.fiscal_mfa_recovery_approval_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE target_kind_value text;
DECLARE target_ref_value text;
DECLARE evidence_ref_value text;
DECLARE case_state text;
DECLARE case_expiry timestamptz;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'MFA recovery approvals are immutable'; END IF;
 SELECT target_kind,target_ref,evidence_ref,state,expires_at
 INTO target_kind_value,target_ref_value,evidence_ref_value,case_state,case_expiry
 FROM public.fiscal_mfa_recovery_cases WHERE id=NEW.case_id;
 IF NOT FOUND OR case_state<>'pending' OR case_expiry<=now()
    OR evidence_ref_value IS DISTINCT FROM NEW.evidence_ref
    OR (NEW.approver_kind=target_kind_value AND NEW.approver_ref=target_ref_value) THEN
   RAISE EXCEPTION 'Invalid independent MFA recovery approval';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_mfa_recovery_approval_guard
 BEFORE INSERT OR UPDATE OR DELETE ON public.fiscal_mfa_recovery_approvals
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_mfa_recovery_approval_integrity();

ALTER TABLE public.fiscal_mfa_recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_mfa_recovery_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_mfa_recovery_cases,public.fiscal_mfa_recovery_approvals FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_mfa_recovery_case_integrity(),public.fiscal_mfa_recovery_approval_integrity() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_mfa_recovery_cases,public.fiscal_mfa_recovery_approvals FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.fiscal_mfa_recovery_case_integrity(),public.fiscal_mfa_recovery_approval_integrity() FROM %I',r);
 END LOOP;
END $$;
COMMIT;

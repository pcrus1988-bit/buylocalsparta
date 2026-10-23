-- 014 MAZI grant acceptance foundation. Financial operations remain DISABLED.
-- Correct first-time financial priority to the VERIFIED ΓΕΜΗ legal entity, not login.
CREATE OR REPLACE FUNCTION mazi_private.proposal_first_support()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE
  funding_round boolean;
  legal_gemi text;
BEGIN
  SELECT m.gemi_number INTO legal_gemi
  FROM public.mazi_members m
  WHERE m.user_id = NEW.created_by AND m.status = 'verified'
    AND m.identity_verified_at IS NOT NULL AND m.gemi_number IS NOT NULL;
  IF legal_gemi IS NULL THEN
    RAISE EXCEPTION 'MAZI_VERIFIED_LEGAL_ENTITY_REQUIRED';
  END IF;

  -- Serialize all future applications by the same verified business identity,
  -- even if it is tied to another auth account later.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(legal_gemi,39127)
  );
  SELECT c.kind = 'fund_allocation' INTO funding_round
  FROM public.mazi_cycles c WHERE c.id = NEW.cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MAZI_CYCLE_NOT_FOUND';
  END IF;
  NEW.first_time_support_request := funding_round AND NOT EXISTS (
    SELECT 1 FROM public.mazi_proposals prior
    JOIN public.mazi_cycles older_cycle ON older_cycle.id = prior.cycle_id
    JOIN public.mazi_members older_member ON older_member.user_id = prior.created_by
    WHERE older_member.gemi_number = legal_gemi
      AND older_cycle.kind = 'fund_allocation'
  );
  RETURN NEW;
END;
$$;

-- Future award offers are created only by separately authorized marketplace
-- governance services using a private direct DB connection. No API creator.
-- An offer is immutable and cannot itself trigger payments or recurring bills.
CREATE TABLE public.mazi_grant_award_offers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.mazi_proposals(id),
  cycle_id uuid NOT NULL REFERENCES public.mazi_cycles(id),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id),
  recipient_gemi_number text NOT NULL CHECK (recipient_gemi_number ~ '^[0-9]{12}$'),
  requested_amount_cents bigint NOT NULL CHECK (requested_amount_cents > 0),
  assigned_amount_cents bigint NOT NULL CHECK (assigned_amount_cents > 0 AND assigned_amount_cents <= requested_amount_cents),
  policy_version text NOT NULL CHECK (policy_version = 'mazi-grant-retention-v1'),
  monthly_membership_fee_cents bigint NOT NULL DEFAULT 25000 CHECK (monthly_membership_fee_cents = 25000),
  monthly_retention_basis_cents bigint NOT NULL DEFAULT 10000 CHECK (monthly_retention_basis_cents = 10000),
  additional_months bigint NOT NULL CHECK (additional_months > 0),
  reapplication_after_months bigint NOT NULL CHECK (reapplication_after_months > 0),
  agreement_body text NOT NULL CHECK (char_length(agreement_body) BETWEEN 400 AND 20000),
  agreement_sha256 text NOT NULL CHECK (agreement_sha256 ~ '^[a-f0-9]{64}$'),
  legal_review_reference text NOT NULL CHECK (char_length(btrim(legal_review_reference)) BETWEEN 20 AND 1000),
  offered_by uuid NOT NULL REFERENCES public.users(id),
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT mazi_award_offer_expiry CHECK (expires_at > offered_at),
  CONSTRAINT mazi_award_period_formula CHECK (additional_months = (requested_amount_cents + 9999) / 10000),
  CONSTRAINT mazi_award_repeat_formula CHECK (reapplication_after_months = (additional_months * 4 + 4) / 5)
);
CREATE INDEX mazi_grant_award_offers_recipient_idx
 ON public.mazi_grant_award_offers(recipient_user_id,offered_at DESC);
ALTER TABLE public.mazi_grant_award_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_grant_award_offers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.mazi_grant_award_offers TO service_role;

CREATE FUNCTION mazi_private.guard_grant_award_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  prop record;
  remaining_budget bigint;
  matching_gemi text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'MAZI_GRANT_OFFER_IMMUTABLE';
  END IF;
  -- The offer itself is impossible in the current nonfinancial founding cycle.
  SELECT p.id,p.cycle_id,p.created_by,p.amount_cents,p.status,
         c.kind,c.status AS cycle_status,c.finance_activated,c.funding_budget_cents
  INTO prop
  FROM public.mazi_proposals p JOIN public.mazi_cycles c ON c.id=p.cycle_id
  WHERE p.id=NEW.proposal_id FOR UPDATE OF p,c;
  IF NOT FOUND OR prop.kind <> 'fund_allocation'
     OR prop.cycle_status <> 'closed' OR prop.finance_activated IS NOT TRUE
     OR prop.status <> 'approved' OR prop.funding_budget_cents <= 0 THEN
    RAISE EXCEPTION 'MAZI_FUNDED_CYCLE_AND_APPROVAL_REQUIRED';
  END IF;
  SELECT m.gemi_number INTO matching_gemi FROM public.mazi_members m
    WHERE m.user_id=prop.created_by AND m.status='verified'
      AND m.identity_verified_at IS NOT NULL;
  IF matching_gemi IS NULL OR matching_gemi IS DISTINCT FROM NEW.recipient_gemi_number
     OR NEW.recipient_user_id <> prop.created_by OR NEW.cycle_id <> prop.cycle_id
     OR NEW.requested_amount_cents <> prop.amount_cents
     OR NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'MAZI_AWARD_IDENTITY_OR_AMOUNT_MISMATCH';
  END IF;
  -- Serialize capacity accounting using the locked cycle row. These offers
  -- only reserve future capacity; actual funds/disbursement have no writer.
  SELECT prop.funding_budget_cents
       - COALESCE(SUM(o.assigned_amount_cents),0)
  INTO remaining_budget
  FROM public.mazi_grant_award_offers o WHERE o.cycle_id=prop.cycle_id;
  IF NEW.assigned_amount_cents > remaining_budget THEN
    RAISE EXCEPTION 'MAZI_AWARD_EXCEEDS_FUND_BUDGET';
  END IF;
  -- The server computes the definitive immutable terms digest from the full
  -- text, ignoring any caller-provided hash.
  NEW.agreement_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(NEW.agreement_body,'UTF8'),'sha256'),'hex'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.guard_grant_award_offer() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_guard_grant_award_offers
 BEFORE INSERT OR UPDATE OR DELETE ON public.mazi_grant_award_offers
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_grant_award_offer();

-- Explicit award-specific recipient confirmation. It is distinct from the
-- preliminary "Need" acknowledgment, and is not an e-signature or a payout.
CREATE TABLE public.mazi_grant_award_acknowledgements (
  offer_id uuid PRIMARY KEY REFERENCES public.mazi_grant_award_offers(id),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id),
  accepted_policy_version text NOT NULL CHECK (accepted_policy_version='mazi-grant-retention-v1'),
  accepted_document_sha256 text NOT NULL CHECK (accepted_document_sha256 ~ '^[a-f0-9]{64}$'),
  affirmatively_accepted boolean NOT NULL CHECK (affirmatively_accepted IS TRUE),
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mazi_grant_award_ack_recipient_idx
 ON public.mazi_grant_award_acknowledgements(recipient_user_id);
ALTER TABLE public.mazi_grant_award_acknowledgements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_grant_award_acknowledgements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.mazi_grant_award_acknowledgements TO service_role;

CREATE FUNCTION mazi_private.guard_grant_award_acknowledgement()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  offer record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'MAZI_AWARD_ACCEPTANCE_IMMUTABLE';
  END IF;
  SELECT o.recipient_user_id,o.recipient_gemi_number,o.policy_version,
    o.agreement_sha256,o.expires_at,c.kind,c.finance_activated,c.status AS cycle_status
  INTO offer
  FROM public.mazi_grant_award_offers o
  JOIN public.mazi_cycles c ON c.id=o.cycle_id
  WHERE o.id=NEW.offer_id FOR UPDATE OF o;
  IF NOT FOUND OR offer.recipient_user_id <> NEW.recipient_user_id
    OR offer.policy_version <> NEW.accepted_policy_version
    OR offer.agreement_sha256 <> NEW.accepted_document_sha256
    OR offer.expires_at <= now()
    OR offer.kind <> 'fund_allocation' OR offer.finance_activated IS NOT TRUE
    OR offer.cycle_status <> 'closed'
    OR NOT EXISTS (
      SELECT 1 FROM public.mazi_members m
      WHERE m.user_id=NEW.recipient_user_id AND m.gemi_number=offer.recipient_gemi_number
       AND m.status='verified' AND m.identity_verified_at IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'MAZI_GRANT_ACCEPTANCE_NOT_ELIGIBLE';
  END IF;
  -- Caller supplied timestamp never proves when terms were accepted.
  NEW.acknowledged_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.guard_grant_award_acknowledgement() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mazi_guard_grant_award_acknowledgements
 BEFORE INSERT OR UPDATE OR DELETE ON public.mazi_grant_award_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_grant_award_acknowledgement();

COMMENT ON TABLE public.mazi_grant_award_acknowledgements IS
  'Future recipient affirmative term acknowledgments only; separate executed agreement and approved disbursement process required.';
-- Neither table contains a payment or membership renewal action.

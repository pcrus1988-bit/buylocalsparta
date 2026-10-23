-- MAZI / 013: record prospective policy notice when a REAL member submits a Need.
-- This migration DOES NOT open a fund, distribute money, create members,
-- generate subscriptions, or treat a future obligation as already contracted.
-- Existing member-facing Data API grants remain revoked.
ALTER TABLE public.mazi_proposals
 ADD COLUMN grant_policy_ack_version text,
 ADD COLUMN grant_policy_acknowledged_at timestamptz,
 ADD COLUMN first_time_support_request boolean NOT NULL DEFAULT false;

-- All MAZI proposals must acknowledge the prospective contract disclosure.
-- It is NOT acceptance of an awarded grant: a separate signed award acceptance
-- must be completed AFTER allocation and BEFORE any disbursement.
ALTER TABLE public.mazi_proposals
 ADD CONSTRAINT mazi_proposal_grant_policy_notice_required
 CHECK (
   grant_policy_ack_version = 'mazi-grant-retention-v1'
   AND grant_policy_acknowledged_at IS NOT NULL
 );

-- Freeze first-time priority at submission, based on the same legal entity's
-- prior FINANCIAL requests. Non-financial founding needs surveys do not count.
-- Member/GEMI identity is verified before member proposal insertion.
CREATE SCHEMA IF NOT EXISTS mazi_private;
REVOKE ALL ON SCHEMA mazi_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA mazi_private TO service_role;

CREATE FUNCTION mazi_private.proposal_first_support()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE
  funding_round boolean;
BEGIN
  -- Serialize simultaneous fund applications for one identity.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.created_by::text, 39127)
  );
  SELECT c.kind = 'fund_allocation' INTO funding_round
    FROM public.mazi_cycles c WHERE c.id = NEW.cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MAZI_CYCLE_NOT_FOUND';
  END IF;

  -- Do not let a caller forge priority status.
  NEW.first_time_support_request := funding_round AND NOT EXISTS (
    SELECT 1 FROM public.mazi_proposals p
    JOIN public.mazi_cycles previous ON previous.id = p.cycle_id
    WHERE p.created_by = NEW.created_by AND previous.kind = 'fund_allocation'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.proposal_first_support() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mazi_private.proposal_first_support() TO service_role;

CREATE TRIGGER mazi_first_support_request
 BEFORE INSERT ON public.mazi_proposals
 FOR EACH ROW EXECUTE FUNCTION mazi_private.proposal_first_support();

-- Never allow changing the original disclosure evidence or first-time label.
CREATE FUNCTION mazi_private.guard_proposal_disclosure()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
BEGIN
 IF NEW.grant_policy_ack_version IS DISTINCT FROM OLD.grant_policy_ack_version
   OR NEW.grant_policy_acknowledged_at IS DISTINCT FROM OLD.grant_policy_acknowledged_at
   OR NEW.first_time_support_request IS DISTINCT FROM OLD.first_time_support_request THEN
   RAISE EXCEPTION 'MAZI_PROPOSAL_DISCLOSURE_IMMUTABLE';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.guard_proposal_disclosure() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mazi_private.guard_proposal_disclosure() TO service_role;
CREATE TRIGGER mazi_proposal_disclosure_immutable
 BEFORE UPDATE ON public.mazi_proposals
 FOR EACH ROW EXECUTE FUNCTION mazi_private.guard_proposal_disclosure();

-- Read source must not be exposed directly to browser roles.
REVOKE ALL PRIVILEGES ON TABLE public.mazi_proposals FROM anon, authenticated;
-- No change to mazi_fund_ledger or role ability to write finances.

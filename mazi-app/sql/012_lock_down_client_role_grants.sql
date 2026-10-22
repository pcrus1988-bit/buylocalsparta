-- MAZI / 012: Member requests go only through the authenticated Edge gateway.
-- Hardening-only migration: no row DML, no financial activation, no changes to
-- non-MAZI tables or the existing marketplace Super Admin's direct PG access.
--
-- Previous grants and historical RLS policies still let the "authenticated"
-- Data API role attempt reads/writes on several public.mazi_* tables. RLS is
-- defense in depth, not a substitute for revoking unused grants.
--
-- The MAZI public website uses the Edge GET /status endpoint, and the member
-- website uses the Edge POST gateway. Neither needs direct browser Data API
-- privileges on MAZI tables. The Edge gateway's existing, deliberately
-- minimal service_role column/table privileges are left untouched.
revoke all privileges on table
  public.mazi_administrators,
  public.mazi_application_followups,
  public.mazi_audit_events,
  public.mazi_cycle_results,
  public.mazi_cycles,
  public.mazi_fund_ledger,
  public.mazi_members,
  public.mazi_membership_applications,
  public.mazi_proposal_results,
  public.mazi_proposals,
  public.mazi_vote_conflicts,
  public.mazi_vote_invalidations,
  public.mazi_votes
from anon, authenticated;

-- Preserve only the pre-existing, narrowly scoped public founding-cycle read.
-- Its RLS policy exposes the zero-budget needs-assessment row exclusively:
-- slug=founding-needs-2026, kind=needs_assessment,
-- finance_activated=false, funding_budget_cents=0.
-- This is backwards compatible with read-only public status consumers.
grant select on table public.mazi_cycles to anon;

-- Intentionally do not grant any direct authenticated access.
-- Financial ledger is not readable/writable by API client or Edge service roles.
-- Historical RLS policies remain for defense in depth; no role bootstrap.

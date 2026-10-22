-- MAZI 009: server-only read access for ballot recusal checks and private post-close results.
-- Public schema access remains denied to anon and authenticated across the marketplace.
grant select on public.mazi_vote_conflicts,public.mazi_vote_invalidations to service_role;
-- Results already have service_role SELECT from migration 008.
revoke insert,update,delete on public.mazi_vote_conflicts,
 public.mazi_vote_invalidations,public.mazi_cycle_results,
 public.mazi_proposal_results from service_role,anon,authenticated;

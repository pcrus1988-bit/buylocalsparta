-- MAZI 010: serialize ballot submission with trusted cycle closure.
-- Advisory lock avoids granting UPDATE on cycle rows to the Edge service_role.
create or replace function public.mazi_validate_ballot() returns trigger
language plpgsql security invoker set search_path='' as $$
declare c record;
begin
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(new.cycle_id::text,24731)
 );
 select id,status,starts_at,ends_at,kind,finance_activated,funding_budget_cents
 into c from public.mazi_cycles where id=new.cycle_id;
 if not found or c.status<>'voting' or c.kind<>'needs_assessment'
    or c.finance_activated or c.funding_budget_cents<>0
    or c.starts_at>now() or c.ends_at<=now() then
  raise exception 'MAZI_BALLOT_CYCLE_CLOSED' using errcode='23514';
 end if;
 if not exists (
  select 1 from public.mazi_members m
  join public.mazi_membership_applications a on a.id=m.application_id
  where m.user_id=new.voter_id and m.status='verified'
    and m.voting_eligible and m.identity_verified_at is not null
    and m.gemi_number is not null and a.status='approved'
 ) then raise exception 'MAZI_BALLOT_INELIGIBLE' using errcode='23514'; end if;
 if not exists (
  select 1 from public.mazi_proposals p
  where p.id=new.proposal_id and p.cycle_id=new.cycle_id
  and p.status='approved' and p.created_by<>new.voter_id
 ) then raise exception 'MAZI_BALLOT_SELF_OR_INVALID' using errcode='23514'; end if;
 if exists (
  select 1 from public.mazi_vote_conflicts x
  where x.cycle_id=new.cycle_id and x.voter_id=new.voter_id
    and x.proposal_id=new.proposal_id
 ) then raise exception 'MAZI_BALLOT_CONFLICT' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function public.mazi_validate_ballot() from public,anon,authenticated;

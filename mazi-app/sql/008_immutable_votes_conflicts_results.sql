-- MAZI 008: one immutable vote per verified business per founding cycle.
-- This is priority-setting for a non-financial needs assessment, NOT grant allocation.
-- Existing votes/proposals are empty at migration time; never seed activity.
create unique index if not exists mazi_one_ballot_per_cycle
 on public.mazi_votes(cycle_id,voter_id);

create table if not exists public.mazi_vote_conflicts (
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null references public.mazi_cycles(id),
 voter_id uuid not null references auth.users(id),
 proposal_id uuid not null references public.mazi_proposals(id),
 reason text not null check (char_length(trim(reason)) between 20 and 1000),
 recorded_by uuid not null references public.users(id),
 recorded_at timestamptz not null default now(),
 unique(cycle_id,voter_id,proposal_id)
);
create index if not exists mazi_vote_conflicts_voter_cycle
 on public.mazi_vote_conflicts(voter_id,cycle_id);
alter table public.mazi_vote_conflicts enable row level security;
revoke all on public.mazi_vote_conflicts from anon,authenticated,service_role;

create table if not exists public.mazi_vote_invalidations (
 id uuid primary key default gen_random_uuid(),
 vote_id uuid not null unique references public.mazi_votes(id),
 cycle_id uuid not null references public.mazi_cycles(id),
 reason text not null check (char_length(trim(reason)) between 20 and 1000),
 recorded_by uuid not null references public.users(id),
 recorded_at timestamptz not null default now()
);
alter table public.mazi_vote_invalidations enable row level security;
revoke all on public.mazi_vote_invalidations from anon,authenticated,service_role;

create table if not exists public.mazi_cycle_results (
 cycle_id uuid primary key references public.mazi_cycles(id),
 finalized_at timestamptz not null default now(),
 finalized_by uuid not null references public.users(id),
 total_ballots bigint not null check (total_ballots>=0),
 invalidated_ballots bigint not null check (invalidated_ballots>=0),
 valid_ballots bigint not null check (valid_ballots>=0),
 proposals_considered int not null check (proposals_considered>=0),
 funding_awarded_cents bigint not null default 0 check (funding_awarded_cents=0),
 check (total_ballots=valid_ballots+invalidated_ballots)
);
create table if not exists public.mazi_proposal_results (
 cycle_id uuid not null references public.mazi_cycle_results(cycle_id),
 proposal_id uuid not null references public.mazi_proposals(id),
 supporting_ballots bigint not null check (supporting_ballots>=0),
 primary key(cycle_id,proposal_id)
);
alter table public.mazi_cycle_results enable row level security;
alter table public.mazi_proposal_results enable row level security;
revoke all on public.mazi_cycle_results,public.mazi_proposal_results
 from anon,authenticated;
grant select on public.mazi_cycle_results,public.mazi_proposal_results to service_role;

create or replace function public.mazi_validate_ballot() returns trigger
language plpgsql set search_path = '' as $$
declare c record;
begin
 select id,status,starts_at,ends_at,kind,finance_activated,funding_budget_cents
 into c from public.mazi_cycles where id=new.cycle_id for share;
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
drop trigger if exists mazi_ballot_guard on public.mazi_votes;
create trigger mazi_ballot_guard before insert on public.mazi_votes
 for each row execute function public.mazi_validate_ballot();

-- Voting is append-only: discovery of a problem creates an explicit invalidation,
-- never erases the original ballot or its audit trail.
create or replace function public.mazi_immutable_row() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'MAZI_IMMUTABLE_GOVERNANCE_RECORD' using errcode='23514'; end; $$;
revoke all on function public.mazi_immutable_row() from public,anon,authenticated;
drop trigger if exists mazi_votes_immutable on public.mazi_votes;
create trigger mazi_votes_immutable before update or delete on public.mazi_votes
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_conflicts_immutable on public.mazi_vote_conflicts;
create trigger mazi_conflicts_immutable before update or delete on public.mazi_vote_conflicts
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_invalidations_immutable on public.mazi_vote_invalidations;
create trigger mazi_invalidations_immutable before update or delete on public.mazi_vote_invalidations
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_cycle_results_immutable on public.mazi_cycle_results;
create trigger mazi_cycle_results_immutable before update or delete on public.mazi_cycle_results
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_proposal_results_immutable on public.mazi_proposal_results;
create trigger mazi_proposal_results_immutable before update or delete on public.mazi_proposal_results
 for each row execute function public.mazi_immutable_row();

-- Identical rows are not duplicated on retry. Only the trusted marketplace
-- Super Admin's transaction can create conflicts, invalidations and results.
-- No direct API client write privileges to these three tables.

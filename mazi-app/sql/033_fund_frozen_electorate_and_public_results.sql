-- 033 MAZI Growth Fund: immutable published rules, electorate freeze and final vote results.
-- This does NOT activate financial cycles or execute grant awards.
create table if not exists public.mazi_fund_cycle_rules (
 cycle_id uuid primary key references public.mazi_cycles(id),
 allocation_policy_version text not null default 'mazi-fund-allocation-v1-draft'
   check (allocation_policy_version='mazi-fund-allocation-v1-draft'),
 quorum_percent integer not null check (quorum_percent between 1 and 100),
 minimum_support_votes integer not null check (minimum_support_votes>=1),
 max_awards integer not null check (max_awards between 1 and 1000),
 project_cap_cents bigint not null check (project_cap_cents between 1 and 20000000),
 published_policy_sha256 text not null check(published_policy_sha256~'^[a-f0-9]{64}$'),
 published_by uuid not null references public.users(id),
 published_at timestamptz not null default now()
);
create table if not exists public.mazi_fund_electorate (
 cycle_id uuid not null references public.mazi_cycles(id),
 voter_user_id uuid not null references auth.users(id),
 voter_gemi_number text not null check (voter_gemi_number~'^[0-9]{12}$'),
 frozen_at timestamptz not null default now(),
 primary key(cycle_id,voter_gemi_number),
 unique(cycle_id,voter_user_id)
);
create table if not exists public.mazi_fund_ballot_invalidations (
 id uuid primary key default gen_random_uuid(),
 ballot_id uuid not null unique references public.mazi_fund_ballots(id),
 cycle_id uuid not null references public.mazi_cycles(id),
 reason text not null check(length(btrim(reason)) between 20 and 1000),
 invalidated_by uuid not null references public.users(id),
 invalidated_at timestamptz not null default now()
);
create table if not exists public.mazi_fund_round_finalizations (
 cycle_id uuid primary key references public.mazi_cycles(id),
 total_ballots bigint not null check(total_ballots>=0),
 valid_ballots bigint not null check(valid_ballots>=0),
 invalidated_ballots bigint not null check(invalidated_ballots>=0),
 electorate_count bigint not null check(electorate_count>=0),
 proposals_considered integer not null check(proposals_considered>=0),
 rules_sha256 text not null check(rules_sha256~'^[a-f0-9]{64}$'),
 finalized_by uuid not null references public.users(id),
 finalized_at timestamptz not null default now(),
 check(total_ballots=valid_ballots+invalidated_ballots),
 check(valid_ballots<=electorate_count)
);
create index if not exists mazi_fund_electorate_member_idx on public.mazi_fund_electorate(voter_user_id,cycle_id);
create index if not exists mazi_fund_invalidations_cycle_idx on public.mazi_fund_ballot_invalidations(cycle_id);
alter table public.mazi_fund_cycle_rules enable row level security;
alter table public.mazi_fund_electorate enable row level security;
alter table public.mazi_fund_ballot_invalidations enable row level security;
alter table public.mazi_fund_round_finalizations enable row level security;
revoke all on public.mazi_fund_cycle_rules,public.mazi_fund_electorate,
 public.mazi_fund_ballot_invalidations,public.mazi_fund_round_finalizations
 from public,anon,authenticated,service_role;
-- MAZI Edge may verify a user's frozen voter record but cannot create/edit it.
grant select on public.mazi_fund_electorate to service_role;
drop trigger if exists mazi_fund_rules_immutable on public.mazi_fund_cycle_rules;
create trigger mazi_fund_rules_immutable before update or delete on public.mazi_fund_cycle_rules
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_fund_electorate_immutable on public.mazi_fund_electorate;
create trigger mazi_fund_electorate_immutable before update or delete on public.mazi_fund_electorate
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_fund_invalidations_immutable on public.mazi_fund_ballot_invalidations;
create trigger mazi_fund_invalidations_immutable before update or delete on public.mazi_fund_ballot_invalidations
 for each row execute function public.mazi_immutable_row();
drop trigger if exists mazi_fund_finalizations_immutable on public.mazi_fund_round_finalizations;
create trigger mazi_fund_finalizations_immutable before update or delete on public.mazi_fund_round_finalizations
 for each row execute function public.mazi_immutable_row();

-- Ensure the voter was part of the frozen electorate BEFORE any funded vote;
-- an approved member admitted later cannot enter a voting round retroactively.
create or replace function mazi_private.require_fund_electorate_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.mazi_fund_electorate e
  where e.cycle_id=new.cycle_id and e.voter_user_id=new.voter_id
    and e.voter_gemi_number=new.voter_gemi_number) then
  raise exception 'MAZI_FUNDED_ELECTORATE_NOT_FROZEN_OR_INELIGIBLE' using errcode='23514';
 end if;
 return new;
end;$$;
revoke all on function mazi_private.require_fund_electorate_snapshot() from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_ballot_snapshot_guard on public.mazi_fund_ballots;
create trigger mazi_fund_ballot_snapshot_guard before insert on public.mazi_fund_ballots
 for each row execute function mazi_private.require_fund_electorate_snapshot();

-- Trusted SQL reader: only closed/finalized tallies, no voter rows or identifiers.
create or replace function public.mazi_fund_public_vote_report()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with r as (
  select f.cycle_id,f.total_ballots,f.valid_ballots,f.invalidated_ballots,
   f.electorate_count,f.proposals_considered,f.finalized_at,
   c.title,c.slug,c.funding_budget_cents,
   rules.quorum_percent,rules.minimum_support_votes,rules.max_awards,
   rules.project_cap_cents,rules.allocation_policy_version,rules.published_policy_sha256
  from public.mazi_fund_round_finalizations f
  join public.mazi_cycles c on c.id=f.cycle_id and c.kind='fund_allocation' and c.status='closed'
  join public.mazi_fund_cycle_rules rules on rules.cycle_id=c.id
  order by f.finalized_at desc limit 1
 )
 select case when not exists(select 1 from r) then
  jsonb_build_object('finalized',false)
 else (select jsonb_build_object(
   'finalized',true,'cycle_slug',r.slug,'title',r.title,
   'funding_budget_cents',r.funding_budget_cents,'total_ballots',r.total_ballots,
   'valid_ballots',r.valid_ballots,'invalidated_ballots',r.invalidated_ballots,
   'electorate_count',r.electorate_count,'quorum_percent',r.quorum_percent,
   'minimum_support_votes',r.minimum_support_votes,'max_awards',r.max_awards,
   'project_cap_cents',r.project_cap_cents,'policy_version',r.allocation_policy_version,
   'rules_sha256',r.published_policy_sha256,'finalized_at',r.finalized_at,
   'proposals',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',p.id,'title',p.title,'amount_cents',p.amount_cents,
       'minimum_useful_cents',p.minimum_useful_cents,
       'supporting_ballots',result.supporting_ballots,
       'first_time_support_request',p.first_time_support_request
     ) order by result.supporting_ballots desc,p.created_at,p.id)
     from public.mazi_fund_vote_results result
     join public.mazi_proposals p on p.id=result.proposal_id
     where result.cycle_id=r.cycle_id
   ),'[]'::jsonb)
  ) from r)
 end;
$$;
revoke all on function public.mazi_fund_public_vote_report() from public,anon,authenticated;
grant execute on function public.mazi_fund_public_vote_report() to service_role;

-- MAZI 029: future financial-round multi-project voting.
-- Deliberately no finance activation, no new cycle and no records seeded.
-- Only verified GEMI legal entities may cast exactly one immutable ballot per round.
create table if not exists public.mazi_fund_ballots (
 id uuid primary key default gen_random_uuid(),
 cycle_id uuid not null references public.mazi_cycles(id),
 voter_id uuid not null references auth.users(id),
 voter_gemi_number text not null check(voter_gemi_number ~ '^[0-9]{12}$'),
 proposal_ids uuid[] not null check (cardinality(proposal_ids) between 1 and 20),
 created_at timestamptz not null default now(),
 unique(cycle_id,voter_id),
 unique(cycle_id,voter_gemi_number)
);
create index if not exists mazi_fund_ballots_cycle_created_idx
 on public.mazi_fund_ballots(cycle_id,created_at desc);
alter table public.mazi_fund_ballots enable row level security;
revoke all on public.mazi_fund_ballots from public,anon,authenticated,service_role;
grant select,insert on public.mazi_fund_ballots to service_role;
create or replace function mazi_private.validate_financial_ballot()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare
 c record;
 m record;
 expected integer;
begin
 if tg_op <> 'INSERT' then raise exception 'MAZI_BALLOT_IMMUTABLE'; end if;
 select * into c from public.mazi_cycles where id=new.cycle_id for share;
 if not found or c.kind <> 'fund_allocation'
    or c.finance_activated is distinct from true
    or c.funding_budget_cents <= 0
    or c.status <> 'voting' or c.starts_at > now() or c.ends_at <= now() then
  raise exception 'MAZI_FUND_CYCLE_NOT_OPEN' using errcode='23514';
 end if;
 select m.user_id,m.gemi_number,m.voting_eligible,m.identity_verified_at,
        m.status,a.status as application_status
 into m from public.mazi_members m
 join public.mazi_membership_applications a on a.id=m.application_id
 where m.user_id=new.voter_id for share of m;
 if not found or m.status <> 'verified' or m.application_status <> 'approved'
  or m.voting_eligible is distinct from true or m.identity_verified_at is null
  or m.gemi_number is null then
  raise exception 'MAZI_FUND_VOTER_INELIGIBLE' using errcode='23514';
 end if;
 -- Do not trust any submitted voter identity/GEMI or custom date.
 new.voter_gemi_number:=m.gemi_number;
 new.created_at:=now();
 select count(distinct x.id)::integer into expected from unnest(new.proposal_ids) as x(id);
 if expected<>cardinality(new.proposal_ids) then
  raise exception 'MAZI_FUND_DUPLICATE_PROPOSALS' using errcode='23514';
 end if;
 if exists (
  select 1 from unnest(new.proposal_ids) as selected(id)
  left join public.mazi_proposals p on p.id=selected.id
  where p.id is null or p.cycle_id<>new.cycle_id
     or p.status<>'approved' or p.created_by=new.voter_id
     or exists (
      select 1 from public.mazi_members recipient
      where recipient.user_id=p.created_by and recipient.gemi_number=m.gemi_number
     )
     or exists (
      select 1 from public.mazi_vote_conflicts cf
      where cf.cycle_id=new.cycle_id and cf.voter_id=new.voter_id and cf.proposal_id=selected.id
     )
 ) then
  raise exception 'MAZI_FUND_CHOICE_NOT_ELIGIBLE' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function mazi_private.validate_financial_ballot() from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_ballot_guard on public.mazi_fund_ballots;
create trigger mazi_fund_ballot_guard before insert on public.mazi_fund_ballots
 for each row execute function mazi_private.validate_financial_ballot();
drop trigger if exists mazi_fund_ballots_immutable on public.mazi_fund_ballots;
create trigger mazi_fund_ballots_immutable before update or delete on public.mazi_fund_ballots
 for each row execute function public.mazi_immutable_row();

-- Immutable totals after closure are distinct from founding-stage needs-assessment counts.
-- A finalized tally never automatically activates a grant, contract or payment.
create table if not exists public.mazi_fund_vote_results (
 cycle_id uuid not null references public.mazi_cycles(id),
 proposal_id uuid not null references public.mazi_proposals(id),
 supporting_ballots bigint not null check (supporting_ballots >= 0),
 tallied_at timestamptz not null default now(),
 finalized_by uuid not null references public.users(id),
 primary key(cycle_id,proposal_id)
);
alter table public.mazi_fund_vote_results enable row level security;
revoke all on public.mazi_fund_vote_results from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_vote_results_immutable on public.mazi_fund_vote_results;
create trigger mazi_fund_vote_results_immutable before update or delete on public.mazi_fund_vote_results
 for each row execute function public.mazi_immutable_row();
comment on table public.mazi_fund_vote_results is
 'Verified final tallies after close, Super Admin controlled; never a payout instruction.';

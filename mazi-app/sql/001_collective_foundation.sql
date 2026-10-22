-- MAZI / operational member, proposal and governance foundation.
-- Additive schema: no existing KONTA MOY tables or data are changed.
create table if not exists public.mazi_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  appointed_at timestamptz not null default now()
);
create table if not exists public.mazi_membership_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null unique references auth.users(id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 3 and 160),
  representative_name text not null check (char_length(trim(representative_name)) between 3 and 120),
  location text not null check (char_length(trim(location)) between 2 and 120),
  sector text not null check (char_length(trim(sector)) between 2 and 100),
  registry_number text check (registry_number is null or char_length(registry_number) <= 35),
  description text not null check (char_length(trim(description)) between 20 and 1800),
  consent_version text not null default 'mazi-interest-v1' check(consent_version='mazi-interest-v1'),
  consent_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create table if not exists public.mazi_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  application_id uuid not null unique references public.mazi_membership_applications(id),
  status text not null default 'verified' check(status in ('verified','suspended')),
  voting_eligible boolean not null default false,
  admitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.mazi_cycles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  kind text not null default 'needs_assessment' check (kind in ('needs_assessment','fund_allocation')),
  status text not null default 'preparing' check(status in ('preparing','submissions','review','voting','closed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  funding_budget_cents bigint not null default 0 check(funding_budget_cents>=0),
  finance_activated boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'needs_assessment' or (funding_budget_cents = 0 and finance_activated = false)),
  check (finance_activated = false or kind = 'fund_allocation')
);
create table if not exists public.mazi_proposals (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.mazi_cycles(id),
  created_by uuid not null references auth.users(id),
  title text not null check(char_length(trim(title)) between 8 and 140),
  category text not null check(category in ('resilience','growth','joint')),
  amount_cents bigint not null check(amount_cents between 50000 and 20000000),
  details text not null check(char_length(trim(details)) between 80 and 4000),
  status text not null default 'submitted' check(status in ('submitted','approved','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(cycle_id,created_by)
);
create table if not exists public.mazi_votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.mazi_cycles(id),
  proposal_id uuid not null references public.mazi_proposals(id),
  voter_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(proposal_id,voter_id)
);
create table if not exists public.mazi_audit_events (
  id bigint generated always as identity primary key,
  happened_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  evidence jsonb not null default '{}'::jsonb
);
create table if not exists public.mazi_fund_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cycle_id uuid references public.mazi_cycles(id),
  event_type text not null check(event_type in ('receipt','allocation','reversal','expense')),
  amount_cents bigint not null check(amount_cents>0),
  external_reference text not null unique,
  evidence jsonb not null default '{}'::jsonb
);
create index if not exists mazi_applications_status_created on public.mazi_membership_applications(status,created_at desc);
create index if not exists mazi_proposals_cycle_status_created on public.mazi_proposals(cycle_id,status,created_at desc);
create index if not exists mazi_votes_proposal_id_idx on public.mazi_votes(proposal_id);
create index if not exists mazi_audit_happened_at_idx on public.mazi_audit_events(happened_at desc);

alter table public.mazi_administrators enable row level security;
alter table public.mazi_membership_applications enable row level security;
alter table public.mazi_members enable row level security;
alter table public.mazi_cycles enable row level security;
alter table public.mazi_proposals enable row level security;
alter table public.mazi_votes enable row level security;
alter table public.mazi_audit_events enable row level security;
alter table public.mazi_fund_ledger enable row level security;

-- Authenticated sessions are never sufficient alone; every policy checks ownership or verified membership.
create or replace function public.mazi_is_administrator() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.mazi_administrators a where a.user_id = (select auth.uid())); $$;
revoke all on function public.mazi_is_administrator() from public, anon;
grant execute on function public.mazi_is_administrator() to authenticated;

revoke all on public.mazi_administrators, public.mazi_membership_applications, public.mazi_members,
  public.mazi_cycles, public.mazi_proposals, public.mazi_votes, public.mazi_audit_events,
  public.mazi_fund_ledger from anon, authenticated;
grant select on public.mazi_administrators to authenticated;
grant select,insert,update on public.mazi_membership_applications to authenticated;
grant select,insert,update on public.mazi_members to authenticated;
grant select,insert,update on public.mazi_cycles to authenticated;
grant select,insert,update on public.mazi_proposals to authenticated;
grant select,insert on public.mazi_votes to authenticated;
grant select on public.mazi_audit_events to authenticated;
-- The funding ledger is NOT exposed to either role. There are no end-user money operations.

create policy "mazi_admin_lookup" on public.mazi_administrators for select to authenticated
using (user_id=(select auth.uid()));
create policy "mazi_application_owner_read" on public.mazi_membership_applications for select to authenticated
using (applicant_user_id=(select auth.uid()) or (select public.mazi_is_administrator()));
create policy "mazi_application_self_apply" on public.mazi_membership_applications for insert to authenticated
with check(applicant_user_id=(select auth.uid()) and status='pending' and reviewed_at is null
and consent_version='mazi-interest-v1');
create policy "mazi_admin_application_review" on public.mazi_membership_applications for update to authenticated
using ((select public.mazi_is_administrator())) with check((select public.mazi_is_administrator()));
create policy "mazi_member_self_read" on public.mazi_members for select to authenticated
using(user_id=(select auth.uid()) or (select public.mazi_is_administrator()));
create policy "mazi_admin_member_insert" on public.mazi_members for insert to authenticated
with check ((select public.mazi_is_administrator()));
create policy "mazi_admin_member_update" on public.mazi_members for update to authenticated
using((select public.mazi_is_administrator())) with check((select public.mazi_is_administrator()));
create policy "mazi_cycle_member_read" on public.mazi_cycles for select to authenticated
using(true);
create policy "mazi_admin_cycle_insert" on public.mazi_cycles for insert to authenticated
with check((select public.mazi_is_administrator()));
create policy "mazi_admin_cycle_update" on public.mazi_cycles for update to authenticated
using((select public.mazi_is_administrator())) with check((select public.mazi_is_administrator()));
create policy "mazi_proposal_owned_or_approved" on public.mazi_proposals for select to authenticated
using (
  created_by=(select auth.uid()) or (select public.mazi_is_administrator()) or (
   status='approved' and exists(select 1 from public.mazi_members m
     where m.user_id=(select auth.uid()) and m.status='verified')
  )
);
create policy "mazi_proposal_verified_insert" on public.mazi_proposals for insert to authenticated
with check (
  created_by=(select auth.uid()) and status='submitted' and reviewed_at is null
  and exists(select 1 from public.mazi_members m where m.user_id=(select auth.uid()) and m.status='verified')
  and exists(select 1 from public.mazi_cycles c where c.id=cycle_id and c.status='submissions'
      and c.starts_at<=now() and c.ends_at>now())
);
create policy "mazi_admin_proposal_review" on public.mazi_proposals for update to authenticated
using((select public.mazi_is_administrator())) with check((select public.mazi_is_administrator()));
create policy "mazi_vote_self_or_admin_read" on public.mazi_votes for select to authenticated
using(voter_id=(select auth.uid()) or (select public.mazi_is_administrator()));
create policy "mazi_vote_verified_insert" on public.mazi_votes for insert to authenticated
with check (
  voter_id=(select auth.uid())
  and exists(select 1 from public.mazi_members m where m.user_id=(select auth.uid())
    and m.status='verified' and m.voting_eligible=true)
  and exists(select 1 from public.mazi_proposals p join public.mazi_cycles c on c.id=p.cycle_id
    where p.id=proposal_id and p.cycle_id=mazi_votes.cycle_id and p.status='approved'
      and p.created_by<>(select auth.uid()) and c.status='voting'
      and c.starts_at<=now() and c.ends_at>now())
);
create policy "mazi_admin_audit_read" on public.mazi_audit_events for select to authenticated
using((select public.mazi_is_administrator()));

-- Only a verified administrator may atomically decide membership.
-- Never auto-grant administrative privileges to the first registrant.
create or replace function public.mazi_review_application(p_application_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_app public.mazi_membership_applications%rowtype;
begin
  if (select auth.uid()) is null or not public.mazi_is_administrator() then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into v_app from public.mazi_membership_applications
    where id=p_application_id for update;
  if not found or v_app.status <> 'pending' then
    raise exception 'Application not pending';
  end if;
  update public.mazi_membership_applications
    set status=case when p_approve then 'approved' else 'rejected' end,
        reviewed_at=now() where id=p_application_id;
  if p_approve then
    insert into public.mazi_members(user_id,application_id,status,voting_eligible)
    values(v_app.applicant_user_id,v_app.id,'verified',false)
    on conflict(user_id) do nothing;
  end if;
  insert into public.mazi_audit_events(actor_user_id,entity_type,entity_id,action,evidence)
    values(auth.uid(),'membership_application',p_application_id,
      case when p_approve then 'approved' else 'rejected' end,
      jsonb_build_object('business',v_app.business_name));
end; $$;
revoke all on function public.mazi_review_application(uuid,boolean) from public, anon;
grant execute on function public.mazi_review_application(uuid,boolean) to authenticated;

-- Guard against users inserting forged votes through the Data API.
create or replace function public.mazi_record_vote() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.mazi_audit_events(actor_user_id,entity_type,entity_id,action,evidence)
  values(new.voter_id,'vote',new.proposal_id,'cast',jsonb_build_object('cycle_id',new.cycle_id));
  return new;
end; $$;
revoke all on function public.mazi_record_vote() from public, anon, authenticated;
create trigger mazi_vote_audit after insert on public.mazi_votes
for each row execute function public.mazi_record_vote();

-- Real opening cycle for collecting verified business needs, not a financing round.
insert into public.mazi_cycles(slug,title,kind,status,starts_at,ends_at,funding_budget_cents,finance_activated)
values('founding-needs-2026','Ιδρυτική καταγραφή επιχειρηματικών αναγκών','needs_assessment','submissions',
       '2026-10-22 00:00:00+03','2026-12-31 23:59:59+02',0,false)
on conflict(slug) do nothing;

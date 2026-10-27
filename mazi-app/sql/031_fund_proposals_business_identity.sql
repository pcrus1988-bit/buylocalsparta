-- MAZI 031: future funded application essentials, no cycle activation.
alter table public.mazi_proposals
 add column if not exists minimum_useful_cents bigint,
 add column if not exists proposer_gemi_number text;
alter table public.mazi_proposals
 drop constraint if exists mazi_proposals_minimum_useful_valid;
alter table public.mazi_proposals
 add constraint mazi_proposals_minimum_useful_valid check (
  minimum_useful_cents is null or
  (minimum_useful_cents>0 and minimum_useful_cents<=amount_cents)
 );
alter table public.mazi_proposals
 drop constraint if exists mazi_proposals_proposer_gemi_number_valid;
alter table public.mazi_proposals
 add constraint mazi_proposals_proposer_gemi_number_valid
 check (proposer_gemi_number is null or proposer_gemi_number ~ '^[0-9]{12}$');
create unique index if not exists mazi_one_proposal_per_legal_business_cycle
 on public.mazi_proposals(cycle_id,proposer_gemi_number)
 where proposer_gemi_number is not null;

create or replace function mazi_private.validate_project_minimum_and_identity()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare c record;
declare m record;
begin
 if tg_op<>'INSERT' then raise exception 'MAZI_GRANT_APPLICATION_IMMUTABLE_IDENTITY'; end if;
 select kind,status,starts_at,ends_at,finance_activated,funding_budget_cents
 into c from public.mazi_cycles where id=new.cycle_id for share;
 if not found or c.status <> 'submissions'
    or c.starts_at>now() or c.ends_at<=now() then
  raise exception 'MAZI_FUND_SUBMISSIONS_CLOSED' using errcode='23514';
 end if;
 select m.gemi_number,m.identity_verified_at,m.status,a.status as application_status
 into m from public.mazi_members m
 join public.mazi_membership_applications a on a.id=m.application_id
 where m.user_id=new.created_by for share of m;
 if not found or m.gemi_number is null or m.identity_verified_at is null
  or m.status <> 'verified' or m.application_status <> 'approved' then
  raise exception 'MAZI_FUND_PROJECT_IDENTITY_REQUIRED' using errcode='23514';
 end if;
 new.proposer_gemi_number:=m.gemi_number;
 if c.kind='fund_allocation' then
  if c.finance_activated is distinct from true or c.funding_budget_cents<=0
    or new.minimum_useful_cents is null or new.minimum_useful_cents<=0
    or new.grant_policy_ack_version<>'mazi-grant-retention-v1'
    or new.grant_policy_acknowledged_at is null then
   raise exception 'MAZI_FUND_REQUIREMENTS_UNMET' using errcode='23514';
  end if;
 else
  if new.minimum_useful_cents is not null then
    raise exception 'MAZI_NEEDS_CYCLE_NOT_FINANCIAL' using errcode='23514';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function mazi_private.validate_project_minimum_and_identity() from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_application_minimum_guard on public.mazi_proposals;
create trigger mazi_fund_application_minimum_guard before insert on public.mazi_proposals
 for each row execute function mazi_private.validate_project_minimum_and_identity();
-- Historical created need proposals retain their prior identity state; this
-- migration never modifies any proposal, vote, award or financial amount.

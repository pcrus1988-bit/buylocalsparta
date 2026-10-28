-- 038 MAZI Growth Fund: legal-entity identity alone is not paid subscription entitlement.
-- Only current, individually invoice-backed member periods may submit funded
-- applications or cast funded ballots. Founding needs-assessment remains unaffected.
create or replace function mazi_private.require_paid_fund_membership()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
 kind text;
 member_id uuid;
begin
 if tg_op <> 'INSERT' then raise exception 'MAZI_FUNDED_MEMBERSHIP_INSERT_ONLY'; end if;
 if tg_table_name = 'mazi_proposals' then
   select c.kind into kind from public.mazi_cycles c where c.id=new.cycle_id;
   if kind is distinct from 'fund_allocation' then
     return new;
   end if;
   member_id:=new.created_by;
 elsif tg_table_name='mazi_fund_ballots' then
   member_id:=new.voter_id;
 else
   raise exception 'MAZI_FUNDED_MEMBERSHIP_WRONG_TABLE';
 end if;
 if not exists (
  select 1 from public.mazi_service_release_state r
  where r.id=true and r.paid_enabled=true and r.activated_at is not null
 ) then
  raise exception 'MAZI_FUND_PAID_MEMBERSHIP_INACTIVE' using errcode='23514';
 end if;
 if not exists (
  select 1 from public.mazi_service_periods p
  where p.member_user_id=member_id
   and p.starts_at<=now() and p.ends_at>now()
   and length(btrim(p.verified_invoice_ref))>=8
 ) then
  raise exception 'MAZI_FUND_VERIFIED_SUBSCRIPTION_REQUIRED' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function mazi_private.require_paid_fund_membership() from public,anon,authenticated,service_role;
drop trigger if exists zz_mazi_fund_paid_application on public.mazi_proposals;
create trigger zz_mazi_fund_paid_application before insert on public.mazi_proposals
 for each row execute function mazi_private.require_paid_fund_membership();
drop trigger if exists zz_mazi_fund_paid_ballot on public.mazi_fund_ballots;
create trigger zz_mazi_fund_paid_ballot before insert on public.mazi_fund_ballots
 for each row execute function mazi_private.require_paid_fund_membership();
comment on function mazi_private.require_paid_fund_membership() is
'Future Fund: paid membership release and current invoice-backed period required; never affects founding needs assessment.';

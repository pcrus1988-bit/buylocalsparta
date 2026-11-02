-- 035: enforce the pre-existing canonical legal Fund month stages at the DB boundary.
-- The €0 founding needs assessment is expressly excluded.
create or replace function mazi_private.enforce_funding_month_stages()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
 day_of_month integer;
 cycle_kind text;
begin
 day_of_month:=extract(day from now() at time zone 'Europe/Athens')::integer;
 if tg_table_name='mazi_proposals' then
   select kind into cycle_kind from public.mazi_cycles where id=new.cycle_id;
   if cycle_kind='fund_allocation' and (day_of_month<1 or day_of_month>10) then
     raise exception 'MAZI_FUND_SUBMISSIONS_REQUIRE_DAYS_1_TO_10' using errcode='23514';
   end if;
 elsif tg_table_name='mazi_fund_ballots' then
   if day_of_month<16 or day_of_month>23 then
     raise exception 'MAZI_FUND_BALLOTS_REQUIRE_DAYS_16_TO_23' using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function mazi_private.enforce_funding_month_stages() from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_proposals_month_window on public.mazi_proposals;
create trigger mazi_fund_proposals_month_window before insert on public.mazi_proposals
 for each row execute function mazi_private.enforce_funding_month_stages();
drop trigger if exists mazi_fund_ballots_month_window on public.mazi_fund_ballots;
create trigger mazi_fund_ballots_month_window before insert on public.mazi_fund_ballots
 for each row execute function mazi_private.enforce_funding_month_stages();

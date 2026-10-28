-- MAZI 030: audit accepted grant ballots without leaking private choices.
-- The ballot itself is immutable and its contents remain private.
create or replace function mazi_private.audit_financial_ballot()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
 insert into public.mazi_audit_events (
  actor_user_id,entity_type,entity_id,action,evidence
 ) values (
  new.voter_id,'fund_ballot',new.id,'submitted',
  jsonb_build_object(
   'cycle_id',new.cycle_id,
   'number_of_projects',cardinality(new.proposal_ids),
   'created_at',new.created_at
  )
 );
 return new;
end;
$$;
revoke all on function mazi_private.audit_financial_ballot() from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_ballot_audit on public.mazi_fund_ballots;
create trigger mazi_fund_ballot_audit after insert on public.mazi_fund_ballots
 for each row execute function mazi_private.audit_financial_ballot();

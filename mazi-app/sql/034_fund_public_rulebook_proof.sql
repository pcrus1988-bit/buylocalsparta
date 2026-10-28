-- MAZI 034: the actual, publicly inspectable governance rulebook must
-- match its immutable SHA-256; mere manually typed digests are insufficient.
alter table public.mazi_fund_cycle_rules
 add column if not exists public_policy_text text;

create or replace function mazi_private.seal_fund_rulebook()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op<>'INSERT' then raise exception 'MAZI_RULEBOOK_IMMUTABLE'; end if;
 if new.public_policy_text is null or
    length(btrim(new.public_policy_text))<400 or
    length(new.public_policy_text)>20000 then
  raise exception 'MAZI_RULEBOOK_PUBLIC_TEXT_REQUIRED' using errcode='23514';
 end if;
 new.published_policy_sha256:=encode(
  extensions.digest(convert_to(new.public_policy_text,'UTF8'),'sha256'),'hex');
 return new;
end;$$;
revoke all on function mazi_private.seal_fund_rulebook() from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_rulebook_hash_guard on public.mazi_fund_cycle_rules;
create trigger mazi_fund_rulebook_hash_guard
 before insert on public.mazi_fund_cycle_rules
 for each row execute function mazi_private.seal_fund_rulebook();

create or replace function public.mazi_fund_public_vote_report()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with r as (
  select f.cycle_id,f.total_ballots,f.valid_ballots,f.invalidated_ballots,
   f.electorate_count,f.proposals_considered,f.finalized_at,
   c.title,c.slug,c.funding_budget_cents,
   rules.quorum_percent,rules.minimum_support_votes,rules.max_awards,
   rules.project_cap_cents,rules.allocation_policy_version,rules.published_policy_sha256,rules.public_policy_text
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
   'rules_sha256',r.published_policy_sha256,'public_policy_text',r.public_policy_text,'finalized_at',r.finalized_at,
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


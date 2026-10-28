-- MAZI service-order evidence: exact catalogue scope acknowledgement.
-- No billing activation and no changes to the protected paid-release state.
create table if not exists public.mazi_service_order_acceptances(
 request_id uuid primary key references public.mazi_service_requests(id),
 member_user_id uuid not null references public.mazi_members(user_id),
 policy_version text not null check (char_length(policy_version) between 12 and 100),
 acceptance_statement text not null check (char_length(acceptance_statement) between 50 and 1500),
 service_id text not null,
 service_title_snapshot text not null,
 description_snapshot text not null,
 deliverable_snapshot text not null,
 token_price_snapshot integer not null check(token_price_snapshot between 5 and 250),
 turnaround_business_days_snapshot integer not null check(turnaround_business_days_snapshot between 1 and 30),
 revisions_included_snapshot integer not null check(revisions_included_snapshot between 0 and 3),
 accepted_at timestamptz not null default now()
);
create index if not exists mazi_order_acceptances_member_idx
 on public.mazi_service_order_acceptances(member_user_id,accepted_at desc);
alter table public.mazi_service_order_acceptances enable row level security;
revoke all on public.mazi_service_order_acceptances from public,anon,authenticated;
grant select on public.mazi_service_order_acceptances to service_role;

-- No client can insert, update or delete acknowledgement evidence.
-- All new requests are written atomically together with their acceptance receipt.
create or replace function public.mazi_services_internal_request_v2(
 p_actor uuid,p_service_id text,p_brief text,p_idempotency_key uuid,
 p_terms_version text,p_terms_accepted boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=p_actor;
 v_period uuid;
 v_price integer;
 v_title text;
 v_description text;
 v_deliverable text;
 v_turnaround integer;
 v_revisions integer;
 v_spent integer;
 v_id uuid;
 v_existing public.mazi_service_requests%rowtype;
 v_statement text:='Αποδέχομαι για το συγκεκριμένο αίτημα την εμφανιζόμενη τιμή Tokens, την περιγραφή και το παραδοτέο, τον ενδεικτικό χρόνο, τις προβλεπόμενες διορθώσεις, τη λήξη μη χρησιμοποιημένων Tokens στο τέλος του κύκλου και την εξαίρεση εξωτερικών εξόδων. Η παραγγελία δεν αντικαθιστά τους χωριστούς όρους συνδρομής.';
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if p_terms_accepted is distinct from true or
    p_terms_version is distinct from 'mazi-service-order-v1-2026-10-28'
 then raise exception 'service_conditions_not_accepted'; end if;
 if p_idempotency_key is null or char_length(trim(coalesce(p_brief,''))) not between 20 and 3000
    or p_service_id is null then raise exception 'invalid_request'; end if;
 if not exists (
  select 1 from public.mazi_members m join public.mazi_membership_applications a on a.id=m.application_id
  where m.user_id=v_uid and m.status='verified' and m.identity_verified_at is not null
    and a.status='approved'
 ) then raise exception 'member_not_eligible'; end if;
 -- Safe retry, even when an old billing period has subsequently expired.
 select * into v_existing from public.mazi_service_requests
  where member_user_id=v_uid and idempotency_key=p_idempotency_key;
 if found then
    if v_existing.service_id is distinct from p_service_id or
       v_existing.brief is distinct from trim(p_brief) or
       not exists(select 1 from public.mazi_service_order_acceptances a
        where a.request_id=v_existing.id and a.policy_version=p_terms_version)
       then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
 end if;
 if not exists(select 1 from public.mazi_service_release_state where id=true and paid_enabled=true)
   then raise exception 'subscription_not_activated'; end if;
 select id into v_period from public.mazi_service_periods where member_user_id=v_uid
   and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
   order by starts_at desc limit 1 for update;
 if v_period is null then raise exception 'allowance_inactive'; end if;
 -- Recheck after the serialized period lock to prevent double-debit races.
 select * into v_existing from public.mazi_service_requests
  where member_user_id=v_uid and idempotency_key=p_idempotency_key;
 if found then
    if v_existing.service_id is distinct from p_service_id or
       v_existing.brief is distinct from trim(p_brief) or
       not exists(select 1 from public.mazi_service_order_acceptances a
        where a.request_id=v_existing.id and a.policy_version=p_terms_version)
       then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
 end if;
 select tokens,title,description,deliverable,turnaround_business_days,revisions_included
 into v_price,v_title,v_description,v_deliverable,v_turnaround,v_revisions
 from public.mazi_service_catalog where id=p_service_id and is_active=true;
 if not found then raise exception 'unknown_service'; end if;
 select coalesce(sum(token_price),0)::integer into v_spent from public.mazi_service_requests
  where period_id=v_period and status in ('requested','accepted','in_progress','completed');
 if v_spent+v_price>250 then raise exception 'insufficient_tokens'; end if;
 insert into public.mazi_service_requests(
  member_user_id,period_id,service_id,service_title_snapshot,token_price,brief,idempotency_key,
  revisions_included_snapshot
 ) values(v_uid,v_period,p_service_id,v_title,v_price,trim(p_brief),p_idempotency_key,v_revisions)
 returning id into v_id;
 insert into public.mazi_service_order_acceptances(
  request_id,member_user_id,policy_version,acceptance_statement,service_id,
  service_title_snapshot,description_snapshot,deliverable_snapshot,token_price_snapshot,
  turnaround_business_days_snapshot,revisions_included_snapshot
 ) values(
  v_id,v_uid,p_terms_version,v_statement,p_service_id,
  v_title,v_description,v_deliverable,v_price,v_turnaround,v_revisions
 );
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta,note)
 values(v_id,v_uid,'reserved',-v_price,'accepted '+p_terms_version);
 return v_id;
end $$;
revoke all on function public.mazi_services_internal_request_v2(uuid,text,text,uuid,text,boolean)
 from public,anon,authenticated;
grant execute on function public.mazi_services_internal_request_v2(uuid,text,text,uuid,text,boolean)
 to service_role;
-- Remove prior service-role request entrypoint. Only the versioned acceptance path may issue new requests.
revoke execute on function public.mazi_services_internal_request(uuid,text,text,uuid)
 from service_role;

-- MAZI service fulfillment phase: immutable member/admin messages, documented handoff,
-- bounded revisions and a mandatory paid-subscription launch lock.
-- Security contract: no public/authenticated schema access; service role reads only.
create table if not exists public.mazi_service_release_state(
 id boolean primary key default true check(id=true),
 paid_enabled boolean not null default false,
 legal_approved_at timestamptz,
 accounting_approved_at timestamptz,
 payment_integration_verified_at timestamptz,
 activated_at timestamptz,
 activated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 check(not paid_enabled or
       (legal_approved_at is not null and accounting_approved_at is not null
        and payment_integration_verified_at is not null and activated_at is not null
        and activated_by is not null))
);
insert into public.mazi_service_release_state(id,paid_enabled)
values(true,false) on conflict(id) do nothing;
alter table public.mazi_service_release_state enable row level security;
revoke all on public.mazi_service_release_state from public,anon,authenticated;
grant select on public.mazi_service_release_state to service_role;
-- Activation requires a separately approved, audited database migration; NO public toggle.

alter table public.mazi_service_requests
 add column if not exists revisions_included_snapshot integer not null default 1
 check (revisions_included_snapshot between 0 and 3);
update public.mazi_service_requests r
set revisions_included_snapshot=c.revisions_included
from public.mazi_service_catalog c
where r.service_id=c.id and r.revisions_included_snapshot=1;

create table if not exists public.mazi_service_messages (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.mazi_service_requests(id),
 author_user_id uuid not null references auth.users(id),
 kind text not null check(kind in (
  'member_message','admin_message','delivery','revision_request','acceptance')),
 body text not null check(char_length(trim(body)) between 10 and 3000),
 delivery_url text,
 created_at timestamptz not null default now(),
 check(delivery_url is null or (
  kind='delivery' and char_length(delivery_url) between 14 and 1200 and
  delivery_url ~ '^https://(drive[.]google[.]com|docs[.]google[.]com)/[^[:space:]]+$'
 ))
);
create index if not exists mazi_service_messages_request_idx
 on public.mazi_service_messages(request_id,id);
alter table public.mazi_service_messages enable row level security;
revoke all on public.mazi_service_messages from public,anon,authenticated;
grant select on public.mazi_service_messages to service_role;

-- Centralize ownership and status checks in the DB.
-- Edge API must authenticate JWT and authorize the caller before passing actor UUID.
create or replace function public.mazi_services_internal_message(
 p_actor uuid,p_request uuid,p_kind text,p_body text,p_delivery_url text default null
) returns bigint language plpgsql security definer set search_path=''
as $$
declare
 v_req public.mazi_service_requests%rowtype;
 v_admin boolean;
 v_note_id bigint;
 v_revisions integer;
begin
 if p_actor is null then raise exception 'not_authenticated'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 10 and 3000
    then raise exception 'invalid_message'; end if;
 if p_kind not in ('member_message','admin_message','delivery','revision_request','acceptance')
    then raise exception 'invalid_message_kind'; end if;
 if p_delivery_url is not null and (
     p_kind <> 'delivery' or char_length(p_delivery_url) not between 14 and 1200 or
     p_delivery_url !~ '^https://(drive[.]google[.]com|docs[.]google[.]com)/[^[:space:]]+$'
 ) then raise exception 'invalid_delivery_url'; end if;
 select * into v_req from public.mazi_service_requests where id=p_request for update;
 if not found then raise exception 'unknown_request'; end if;
 select exists(select 1 from public.mazi_administrators where user_id=p_actor) into v_admin;
 if not v_admin and v_req.member_user_id<>p_actor then raise exception 'not_authorized'; end if;
 if p_kind in ('admin_message','delivery') and not v_admin then raise exception 'not_authorized'; end if;
 if p_kind in ('member_message','revision_request','acceptance') and v_req.member_user_id<>p_actor then
    raise exception 'not_authorized'; end if;

 if p_kind='member_message' and v_req.status not in ('requested','accepted','in_progress','completed')
    then raise exception 'invalid_message_state'; end if;
 if p_kind='admin_message' and v_req.status in ('cancelled','rejected')
    then raise exception 'invalid_message_state'; end if;
 if p_kind='delivery' then
    if v_req.status not in ('accepted','in_progress') then raise exception 'invalid_message_state'; end if;
    if char_length(trim(p_body))<40 then raise exception 'delivery_summary_required'; end if;
 end if;
 if p_kind='revision_request' then
    if v_req.status<>'completed' or v_req.completed_at is null or
       clock_timestamp()>v_req.completed_at + interval '10 days' then
       raise exception 'revision_window_closed'; end if;
    if exists(select 1 from public.mazi_service_messages where request_id=p_request and kind='acceptance')
       then raise exception 'already_accepted'; end if;
    select count(*) into v_revisions from public.mazi_service_messages
      where request_id=p_request and kind='revision_request';
    if v_revisions>=v_req.revisions_included_snapshot then raise exception 'revision_limit_reached'; end if;
 end if;
 if p_kind='acceptance' then
    if v_req.status<>'completed' or not exists(
      select 1 from public.mazi_service_messages where request_id=p_request and kind='delivery'
    ) then raise exception 'not_delivered'; end if;
    if exists(select 1 from public.mazi_service_messages where request_id=p_request and kind='acceptance')
       then raise exception 'already_accepted'; end if;
 end if;
 insert into public.mazi_service_messages(request_id,author_user_id,kind,body,delivery_url)
 values(p_request,p_actor,p_kind,trim(p_body),p_delivery_url) returning id into v_note_id;

 if p_kind='delivery' then
    update public.mazi_service_requests
      set status='completed',completed_at=now(),updated_at=now(),handled_by=p_actor,
          admin_note=left(trim(p_body),2000)
      where id=p_request;
    insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta,note)
      values(p_request,p_actor,'completed',0,left(trim(p_body),2000));
 elsif p_kind='revision_request' then
    update public.mazi_service_requests set status='in_progress',
      updated_at=now(),completed_at=null where id=p_request;
    insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta,note)
      values(p_request,p_actor,'started',0,'member_revision_requested');
 end if;
 return v_note_id;
end $$;
revoke all on function public.mazi_services_internal_message(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mazi_services_internal_message(uuid,uuid,text,text,text) to service_role;

-- Additional immutable audit trail via existing service_events; client cannot mutate messages.

create or replace function public.mazi_services_internal_issue_period(
 p_actor uuid,p_member uuid,p_starts timestamptz,p_ends timestamptz,p_verified_invoice_ref text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_uid uuid := p_actor;
begin
 if v_uid is null or not exists(select 1 from public.mazi_administrators where user_id=v_uid) then raise exception 'not_authorized'; end if;
 if not exists(select 1 from public.mazi_service_release_state where id=true and paid_enabled=true) then
    raise exception 'subscription_not_activated';
 end if;
 if p_verified_invoice_ref is null or char_length(trim(p_verified_invoice_ref)) not between 8 and 160 then raise exception 'invoice_reference_required'; end if;
 if p_starts is null or p_ends is null or p_ends<=p_starts or p_ends>p_starts+interval '32 days' or p_ends<p_starts+interval '27 days' then
    raise exception 'invalid_billing_period';
 end if;
 perform 1 from public.mazi_members m join public.mazi_membership_applications a on a.id=m.application_id
  where m.user_id=p_member and m.status='verified' and m.identity_verified_at is not null
    and a.status='approved' for update of m;
 if not found then raise exception 'member_not_eligible'; end if;
 select id into v_id from public.mazi_service_periods where verified_invoice_ref=p_verified_invoice_ref;
 if found then
   if not exists(select 1 from public.mazi_service_periods where id=v_id and member_user_id=p_member and starts_at=p_starts and ends_at=p_ends)
    then raise exception 'invoice_reference_conflict'; end if;
   return v_id;
 end if;
 if exists(select 1 from public.mazi_service_periods where member_user_id=p_member
  and starts_at<p_ends and ends_at>p_starts) then raise exception 'overlapping_period'; end if;
 insert into public.mazi_service_periods(member_user_id,starts_at,ends_at,verified_invoice_ref,issued_by)
 values(p_member,p_starts,p_ends,trim(p_verified_invoice_ref),v_uid) returning id into v_id;
 insert into public.mazi_audit_events(actor_user_id,entity_type,entity_id,action,evidence)
 values(v_uid,'mazi_service_period',v_id,'issued',jsonb_build_object('member_user_id',p_member,'starts_at',p_starts,'ends_at',p_ends,'reference',p_verified_invoice_ref,'tokens',250));
 return v_id;
end $$;
create or replace function public.mazi_services_internal_request(
 p_actor uuid,p_service_id text,p_brief text,p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := p_actor; v_period uuid; v_price integer; v_title text; v_revisions integer; v_spent integer; v_id uuid;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if p_idempotency_key is null or char_length(trim(coalesce(p_brief,''))) not between 20 and 3000 then raise exception 'invalid_request'; end if;
 if not exists (
   select 1 from public.mazi_members m join public.mazi_membership_applications a on a.id=m.application_id
    where m.user_id=v_uid and m.status='verified' and m.identity_verified_at is not null and a.status='approved'
 ) then raise exception 'member_not_eligible'; end if;
 -- Serialize the balance by locking one paid period row for the whole request transaction.
 select id into v_period from public.mazi_service_periods where member_user_id=v_uid
  and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
  order by starts_at desc limit 1 for update;
 if v_period is null then raise exception 'allowance_inactive'; end if;
 select id into v_id from public.mazi_service_requests
  where member_user_id=v_uid and idempotency_key=p_idempotency_key;
 if found then return v_id; end if;
 select tokens,title,revisions_included into v_price,v_title,v_revisions from public.mazi_service_catalog where id=p_service_id and is_active=true;
 if v_price is null then raise exception 'unknown_service'; end if;
 select coalesce(sum(token_price),0)::integer into v_spent from public.mazi_service_requests
  where period_id=v_period and status in ('requested','accepted','in_progress','completed');
 if v_spent+v_price>250 then raise exception 'insufficient_tokens'; end if;
 insert into public.mazi_service_requests(member_user_id,period_id,service_id,service_title_snapshot,token_price,brief,idempotency_key,revisions_included_snapshot)
 values(v_uid,v_period,p_service_id,v_title,v_price,trim(p_brief),p_idempotency_key,v_revisions) returning id into v_id;
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta)
 values(v_id,v_uid,'reserved',-v_price);
 return v_id;
end $$;
create or replace function public.mazi_services_internal_admin_transition(
 p_actor uuid,p_request uuid,p_status text,p_note text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_row public.mazi_service_requests%rowtype; v_uid uuid := p_actor; v_event text; v_delta integer := 0;
begin
 if v_uid is null or not exists(select 1 from public.mazi_administrators where user_id=v_uid) then raise exception 'not_authorized'; end if;
 if char_length(coalesce(p_note,''))>2000 then raise exception 'note_too_long'; end if;
 select * into v_row from public.mazi_service_requests where id=p_request for update;
 if not found then raise exception 'unknown_request'; end if;
 if p_status='completed' then raise exception 'delivery_required'; end if;
 if not (
   (v_row.status='requested' and p_status in ('accepted','rejected')) or
   (v_row.status='accepted' and p_status in ('in_progress','completed','cancelled')) or
   (v_row.status='in_progress' and p_status in ('completed','cancelled'))
 ) then raise exception 'invalid_transition'; end if;
 if p_status in ('rejected','cancelled') and char_length(trim(coalesce(p_note,'')))<10 then
    raise exception 'reason_required';
 end if;
 v_delta := case when p_status in ('rejected','cancelled') then v_row.token_price else 0 end;
 v_event := case p_status when 'accepted' then 'accepted' when 'in_progress' then 'started' else p_status end;
 update public.mazi_service_requests
  set status=p_status,updated_at=now(),handled_by=v_uid,admin_note=nullif(trim(coalesce(p_note,'')),''),
      completed_at=case when p_status='completed' then now() else completed_at end
  where id=p_request;
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta,note)
 values(p_request,v_uid,v_event,v_delta,p_note);
 return true;
end $$;

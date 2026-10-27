-- MAZI service gateway isolation. Authenticated and anon retain no public-schema USAGE.
-- Only the Supabase Edge service role may call the explicit-actor internal procedures.
-- The Edge function MUST verify the end-user JWT with Supabase Auth and admin status.
grant select on public.mazi_service_catalog,public.mazi_service_periods,public.mazi_service_requests,public.mazi_service_events,public.mazi_administrators to service_role;

create or replace function public.mazi_services_internal_issue_period(\n p_actor uuid,p_member uuid,p_starts timestamptz,p_ends timestamptz,p_verified_invoice_ref text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_uid uuid := p_actor;
begin
 if v_uid is null or not exists(select 1 from public.mazi_administrators where user_id=v_uid) then raise exception 'not_authorized'; end if;
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
revoke all on function public.mazi_services_internal_issue_period(uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.mazi_services_internal_issue_period(uuid,uuid,timestamptz,timestamptz,text) to service_role;

create or replace function public.mazi_services_internal_request(\n p_actor uuid,p_service_id text,p_brief text,p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := p_actor; v_period uuid; v_price integer; v_title text; v_spent integer; v_id uuid;
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
 select tokens,title into v_price,v_title from public.mazi_service_catalog where id=p_service_id and is_active=true;
 if v_price is null then raise exception 'unknown_service'; end if;
 select coalesce(sum(token_price),0)::integer into v_spent from public.mazi_service_requests
  where period_id=v_period and status in ('requested','accepted','in_progress','completed');
 if v_spent+v_price>250 then raise exception 'insufficient_tokens'; end if;
 insert into public.mazi_service_requests(member_user_id,period_id,service_id,service_title_snapshot,token_price,brief,idempotency_key)
 values(v_uid,v_period,p_service_id,v_title,v_price,trim(p_brief),p_idempotency_key) returning id into v_id;
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta)
 values(v_id,v_uid,'reserved',-v_price);
 return v_id;
end $$;
revoke all on function public.mazi_services_internal_request(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.mazi_services_internal_request(uuid,text,text,uuid) to service_role;

create or replace function public.mazi_services_internal_cancel_request(p_actor uuid,p_request uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_row public.mazi_service_requests%rowtype; v_uid uuid := p_actor;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 select * into v_row from public.mazi_service_requests where id=p_request for update;
 if not found or v_row.member_user_id<>v_uid or v_row.status<>'requested' then raise exception 'cannot_cancel'; end if;
 update public.mazi_service_requests set status='cancelled',updated_at=now() where id=p_request;
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta)
 values(p_request,v_uid,'cancelled',v_row.token_price);
 return true;
end $$;
revoke all on function public.mazi_services_internal_cancel_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mazi_services_internal_cancel_request(uuid,uuid) to service_role;

create or replace function public.mazi_services_internal_admin_transition(\n p_actor uuid,p_request uuid,p_status text,p_note text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_row public.mazi_service_requests%rowtype; v_uid uuid := p_actor; v_event text; v_delta integer := 0;
begin
 if v_uid is null or not exists(select 1 from public.mazi_administrators where user_id=v_uid) then raise exception 'not_authorized'; end if;
 if char_length(coalesce(p_note,''))>2000 then raise exception 'note_too_long'; end if;
 select * into v_row from public.mazi_service_requests where id=p_request for update;
 if not found then raise exception 'unknown_request'; end if;
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
revoke all on function public.mazi_services_internal_admin_transition(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.mazi_services_internal_admin_transition(uuid,uuid,text,text) to service_role;
-- No direct client role can execute financial or token-changing functions even if schema grants change in the future.
revoke execute on function public.mazi_services_issue_period(uuid,timestamptz,timestamptz,text) from anon,authenticated;
revoke execute on function public.mazi_services_request(text,text,uuid) from anon,authenticated;
revoke execute on function public.mazi_services_cancel_request(uuid) from anon,authenticated;
revoke execute on function public.mazi_services_admin_transition(uuid,text,text) from anon,authenticated;

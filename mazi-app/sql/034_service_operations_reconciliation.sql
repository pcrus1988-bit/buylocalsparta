-- MAZI service operations: read-only, all-period financial-token reconciliation.
-- Contract: token units represent catalogue service entitlement, NOT cash balance.
-- JWT auth + MAZI administrator authorization happen in the Edge gateway;
-- this function also verifies administrator membership (defense in depth).
-- No public or authenticated Data API access and no billing activation.
create or replace function public.mazi_services_internal_admin_health(p_actor uuid)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare v_report jsonb;
begin
 if p_actor is null or not exists(
   select 1 from public.mazi_administrators where user_id=p_actor
 ) then raise exception 'not_authorized'; end if;
 with period_usage as (
  select
    p.id,p.member_user_id,p.starts_at,p.ends_at,p.allowance_tokens,p.verified_invoice_ref,
    coalesce(sum(r.token_price) filter (
       where r.status in ('requested','accepted','in_progress','completed')),0)::integer as committed,
    coalesce(sum(r.token_price) filter (
       where r.status in ('requested','accepted','in_progress')),0)::integer as reserved,
    coalesce(sum(r.token_price) filter (where r.status='completed'),0)::integer as completed,
    count(r.id)::integer as request_count
  from public.mazi_service_periods p
  left join public.mazi_service_requests r on r.period_id=p.id
  group by p.id,p.member_user_id,p.starts_at,p.ends_at,p.allowance_tokens,p.verified_invoice_ref
 ), period_summary as (
  select
    count(*)::integer as total_periods,
    coalesce(sum(allowance_tokens),0)::bigint as issued_tokens,
    coalesce(sum(committed),0)::bigint as committed_tokens,
    coalesce(sum(reserved),0)::bigint as reserved_tokens,
    coalesce(sum(completed),0)::bigint as completed_tokens,
    coalesce(sum(greatest(allowance_tokens-committed,0))
      filter (where starts_at<=clock_timestamp() and ends_at>clock_timestamp()),0)::bigint as available_active_tokens,
    coalesce(sum(greatest(allowance_tokens-committed,0))
      filter (where ends_at<=clock_timestamp()),0)::bigint as expired_unused_tokens,
    coalesce(sum(allowance_tokens) filter (where starts_at>clock_timestamp()),0)::bigint as future_allocated_tokens,
    count(*) filter (where committed>allowance_tokens)::integer as overdrawn_periods,
    count(*) filter (where starts_at<=clock_timestamp() and ends_at>clock_timestamp())::integer as active_periods
  from period_usage
 ), request_summary as (
  select
   count(*)::integer as total_requests,
   count(*) filter (where status='requested')::integer as waiting_requests,
   count(*) filter (where status='accepted')::integer as accepted_requests,
   count(*) filter (where status='in_progress')::integer as in_progress_requests,
   count(*) filter (where status='completed')::integer as completed_requests,
   count(*) filter (where status='cancelled')::integer as cancelled_requests,
   count(*) filter (where status='rejected')::integer as rejected_requests,
   count(*) filter (where status='requested' and created_at < clock_timestamp()-interval '48 hours')::integer as waiting_over_48_hours,
   count(*) filter (where status in ('accepted','in_progress')
     and created_at < clock_timestamp()-interval '14 days')::integer as open_over_14_days,
   count(*) filter (where not exists(
    select 1 from public.mazi_service_order_acceptances a where a.request_id=r.id
   ))::integer as missing_order_acceptances,
   count(*) filter (where status='completed' and not exists(
    select 1 from public.mazi_service_messages m
    where m.request_id=r.id and m.kind='delivery'
   ))::integer as completed_without_delivery,
   count(*) filter (where status='in_progress' and exists(
    select 1 from public.mazi_service_messages m
    where m.request_id=r.id and m.kind='revision_request'
   ))::integer as revisions_in_progress
  from public.mazi_service_requests r
 ), ledger as (
  select coalesce(sum(token_delta),0)::bigint as event_delta,
         count(*)::integer as event_count
  from public.mazi_service_events
 ), release as (
  select paid_enabled,
    (legal_approved_at is not null) as legal_approved,
    (accounting_approved_at is not null) as accounting_approved,
    (payment_integration_verified_at is not null) as payment_verified
  from public.mazi_service_release_state where id=true
 ), latest_periods as (
  select coalesce(jsonb_agg(jsonb_build_object(
   'period_id',p.id,
   'member_user_id',p.member_user_id,
   'starts_at',p.starts_at,
   'ends_at',p.ends_at,
   'invoice_reference',p.verified_invoice_ref,
   'allowance',p.allowance_tokens,
   'committed',p.committed,
   'reserved',p.reserved,
   'completed',p.completed,
   'unallocated',greatest(p.allowance_tokens-p.committed,0),
   'request_count',p.request_count,
   'phase',case when p.starts_at>clock_timestamp() then 'future'
       when p.ends_at<=clock_timestamp() then 'expired'
       else 'active' end
  ) order by p.starts_at desc), '[]'::jsonb) as items
  from (select * from period_usage order by starts_at desc limit 30) p
 )
 select jsonb_build_object(
  'as_of',clock_timestamp(),
  'paid_enabled',coalesce((select paid_enabled from release),false),
  'legal_approved',coalesce((select legal_approved from release),false),
  'accounting_approved',coalesce((select accounting_approved from release),false),
  'payment_verified',coalesce((select payment_verified from release),false),
  'periods',to_jsonb(p),
  'requests',to_jsonb(r),
  'ledger_event_count',l.event_count,
  'ledger_net_token_delta',l.event_delta,
  'ledger_difference_tokens',(-l.event_delta)-p.committed_tokens,
  'recent_periods',lp.items
 ) into v_report
 from period_summary p cross join request_summary r
 cross join ledger l cross join latest_periods lp;
 return v_report;
end $$;
revoke all on function public.mazi_services_internal_admin_health(uuid) from public,anon,authenticated;
grant execute on function public.mazi_services_internal_admin_health(uuid) to service_role;

-- Companion Android: transactional order and pickup-ready outbox.
-- Depends on companion_android_sessions and companion_android_push_devices.
-- This migration creates NO delivery scheduler and grants NO vendor access.
-- No notifications are sent without a separately secret-gated server dispatcher.
create schema if not exists companion_private;
revoke all on schema companion_private from public, anon, authenticated;

create table if not exists public.companion_push_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) between 16 and 220),
  event_type text not null check (event_type in ('order_status','pickup_ready')),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  pickup_group_id uuid references public.pickup_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  status text not null default 'pending' check (status in ('pending','processed','suppressed')),
  processed_at timestamptz
);
create index if not exists companion_push_outbox_ready_idx
  on public.companion_push_outbox(created_at) where status='pending';
create table if not exists public.companion_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.companion_push_outbox(id) on delete cascade,
  device_id uuid not null references public.companion_push_devices(id) on delete cascade,
  status text not null default 'pending'
    check(status in ('pending','reserved','submitted','retry','invalid','suppressed','failed')),
  attempts int not null default 0 check(attempts between 0 and 5),
  due_at timestamptz not null default now(),
  reserved_until timestamptz,
  provider_message_id text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(outbox_id,device_id)
);
create index if not exists companion_push_deliveries_dispatch_idx
  on public.companion_push_deliveries(due_at) where status in ('pending','retry');
create index if not exists companion_push_deliveries_rate_idx
  on public.companion_push_deliveries(device_id,created_at desc);
alter table public.companion_push_outbox enable row level security;
alter table public.companion_push_deliveries enable row level security;
revoke all on public.companion_push_outbox from public,anon,authenticated;
revoke all on public.companion_push_deliveries from public,anon,authenticated;
comment on table public.companion_push_outbox is
  'Real customer order and pickup events only. No GPS, shopping-list, vendor freeform messages or device tokens.';

-- Trigger-only insertion. SECURITY DEFINER lives in a private schema with
-- a locked search_path and explicit table references. No external EXECUTE grant.
create or replace function companion_private.queue_companion_order_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.user_id is null or old.status is not distinct from new.status
     or new.status::text not in
       ('authorised','confirmed','partially_fulfilled','fulfilled',
        'completed','cancelled','partially_refunded','refunded') then
    return new;
  end if;
  if not exists (
    select 1 from public.companion_push_devices d
    join public.companion_mobile_sessions s on s.id=d.session_id
    where d.user_id=new.user_id and d.disabled_at is null
      and d.order_updates_enabled and s.revoked_at is null
      and s.absolute_expires_at>now() and s.refresh_expires_at>now()
  ) then return new; end if;
  insert into public.companion_push_outbox(event_key,event_type,user_id,order_id)
  values ('order:'||new.id::text||':'||new.status::text||':'||
    extract(epoch from clock_timestamp())::text,
    'order_status',new.user_id,new.id);
  return new;
end;
$$;
revoke all on function companion_private.queue_companion_order_event() from public,anon,authenticated;
drop trigger if exists companion_order_status_push_outbox on public.customer_orders;
create trigger companion_order_status_push_outbox
after update of status on public.customer_orders
for each row when (old.status is distinct from new.status)
execute function companion_private.queue_companion_order_event();

create or replace function companion_private.queue_companion_pickup_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_group uuid;
  v_order uuid;
  v_user uuid;
begin
  if tg_table_name='pickup_groups' then
    v_group:=new.id;
  else
    select pg.id into v_group from public.pickup_groups pg
      where pg.fulfilment_order_id=new.id and pg.ready_at is not null
        and pg.collected_at is null
      order by pg.ready_at desc limit 1;
  end if;
  if v_group is null then return new; end if;

  select o.id,o.user_id into v_order,v_user
  from public.pickup_groups pg
  join public.fulfilment_orders fo on fo.id=pg.fulfilment_order_id
  join public.customer_orders o on o.id=fo.order_id
  where pg.id=v_group and pg.ready_at is not null and pg.collected_at is null
    and fo.mode='pickup' and fo.status='ready_for_handover'
    and o.status not in ('cancelled','refunded')
    and o.user_id is not null;
  if v_order is null then return new; end if;
  if not exists (
    select 1 from public.companion_push_devices d
    join public.companion_mobile_sessions s on s.id=d.session_id
    where d.user_id=v_user and d.disabled_at is null
      and d.order_updates_enabled and s.revoked_at is null
      and s.absolute_expires_at>now() and s.refresh_expires_at>now()
  ) then return new; end if;

  insert into public.companion_push_outbox
    (event_key,event_type,user_id,order_id,pickup_group_id)
  values ('pickup:'||v_group::text||':ready','pickup_ready',v_user,v_order,v_group)
  on conflict(event_key) do nothing;
  return new;
end;
$$;
revoke all on function companion_private.queue_companion_pickup_event() from public,anon,authenticated;
drop trigger if exists companion_pickup_group_ready_push_outbox on public.pickup_groups;
create trigger companion_pickup_group_ready_push_outbox
after insert or update of ready_at on public.pickup_groups
for each row when (new.ready_at is not null)
execute function companion_private.queue_companion_pickup_event();
drop trigger if exists companion_fulfilment_ready_push_outbox on public.fulfilment_orders;
create trigger companion_fulfilment_ready_push_outbox
after update of status on public.fulfilment_orders
for each row when (old.status is distinct from new.status and new.status='ready_for_handover')
execute function companion_private.queue_companion_pickup_event();

select cron.schedule('companion-push-outbox-retention-v1','15 5 * * *',$cleanup$
  delete from public.companion_push_outbox
    where created_at < now() - interval '30 days';
$cleanup$);

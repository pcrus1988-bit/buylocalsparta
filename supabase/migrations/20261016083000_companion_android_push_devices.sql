-- KONTA MOY Companion: private, opt-in, session-bound Android FCM devices.
-- Apply ONLY after 20261016074500_companion_android_sessions.sql.
-- No send job, vendor campaign or notification is activated by this migration.
create table if not exists public.companion_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null unique references public.companion_mobile_sessions(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_encrypted text not null check (length(token_encrypted) between 80 and 4096),
  provider text not null default 'fcm' check (provider='fcm'),
  order_updates_enabled boolean not null default false,
  saved_items_enabled boolean not null default false,
  vendor_offers_enabled boolean not null default false,
  consent_version text not null default 'companion-android-push-v1'
    check (consent_version='companion-android-push-v1'),
  consented_at timestamptz not null default now(),
  last_registered_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  check (not vendor_offers_enabled)
);
create index if not exists companion_push_devices_user_idx
  on public.companion_push_devices(user_id) where disabled_at is null;
create table if not exists public.companion_push_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.companion_mobile_sessions(id) on delete set null,
  order_updates_enabled boolean not null,
  saved_items_enabled boolean not null,
  vendor_offers_enabled boolean not null default false,
  action text not null check (action in ('register','update','disable')),
  consent_version text not null default 'companion-android-push-v1',
  created_at timestamptz not null default now()
);
create index if not exists companion_push_consent_user_idx
  on public.companion_push_consent_events(user_id,created_at desc);
create table if not exists public.companion_push_test_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_id uuid not null references public.companion_push_devices(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'reserved' check (status in ('reserved','submitted','failed')),
  provider_message_id text
);
create index if not exists companion_push_test_log_limit_idx
  on public.companion_push_test_log(device_id,requested_at desc);
alter table public.companion_push_devices enable row level security;
alter table public.companion_push_consent_events enable row level security;
alter table public.companion_push_test_log enable row level security;
revoke all on public.companion_push_devices from public,anon,authenticated;
revoke all on public.companion_push_consent_events from public,anon,authenticated;
revoke all on public.companion_push_test_log from public,anon,authenticated;
comment on table public.companion_push_devices is
  'Android FCM device tokens encrypted at rest; bound to one mobile session and customer. Marketing always disabled in v1. No GPS collected.';
-- Same cron extension as earlier Companion auth migration.
select cron.schedule('companion-push-retention-v1','20 4 * * *',$cleanup$
  delete from public.companion_push_devices d
    where d.disabled_at < now() - interval '7 days'
      or not exists (
        select 1 from public.companion_mobile_sessions s
        where s.id=d.session_id and s.revoked_at is null
          and s.absolute_expires_at>now()
      );
  delete from public.companion_push_consent_events
    where created_at < now() - interval '365 days';
  delete from public.companion_push_test_log
    where requested_at < now() - interval '30 days';
$cleanup$);

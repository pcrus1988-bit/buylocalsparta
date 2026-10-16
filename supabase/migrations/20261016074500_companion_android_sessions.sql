-- KONTA MOY Companion (Android): independent, revocable OAuth-style PKCE sessions.
-- This migration MUST precede mobile auth deployment; nothing is enabled in production by this PR.
create table if not exists public.companion_authorization_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  client_id text not null default 'kontamou-companion-android'
    check (client_id='kontamou-companion-android'),
  redirect_uri text not null default 'kontamoucompanion://auth'
    check (redirect_uri='kontamoucompanion://auth'),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists companion_authorization_codes_expires_idx
  on public.companion_authorization_codes(expires_at);
create table if not exists public.companion_mobile_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  access_hash text not null unique check (access_hash ~ '^[a-f0-9]{64}$'),
  refresh_hash text not null unique check (refresh_hash ~ '^[a-f0-9]{64}$'),
  previous_refresh_hash text check (previous_refresh_hash is null or previous_refresh_hash ~ '^[a-f0-9]{64}$'),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
create index if not exists companion_mobile_sessions_user_idx
  on public.companion_mobile_sessions(user_id,created_at desc);
create index if not exists companion_mobile_sessions_expiry_idx
  on public.companion_mobile_sessions(absolute_expires_at);

alter table public.companion_authorization_codes enable row level security;
alter table public.companion_mobile_sessions enable row level security;
-- No direct Supabase Data API access. Application APIs validate account ownership
-- and use short-lived opaque bearer tokens whose plaintext is never persisted.
revoke all on public.companion_authorization_codes from PUBLIC, anon, authenticated;
revoke all on public.companion_mobile_sessions from PUBLIC, anon, authenticated;
comment on table public.companion_mobile_sessions is 'Android Companion opaque bearer/refresh token hashes. Revoke on logout, account closure and refresh replay. No vendor access.';
-- Existing pg_cron installation is required; cleanup does not mutate live orders.
select cron.schedule(
  'companion-auth-expiry-purge-v1',
  '40 3 * * *',
  $cleanup$
    delete from public.companion_authorization_codes
      where expires_at < now() - interval '1 day';
    delete from public.companion_mobile_sessions
      where absolute_expires_at < now() - interval '1 day'
         or (revoked_at is not null and revoked_at < now() - interval '30 days');
  $cleanup$
);

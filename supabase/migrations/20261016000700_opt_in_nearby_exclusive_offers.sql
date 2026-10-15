-- Opt-in nearby exclusive offers. No raw customer coordinates are stored.
-- Server-side endpoints enforce session ownership, CSRF and vendor capabilities.
create table if not exists public.nearby_offer_campaigns (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_businesses(id) on delete cascade,
  location_id uuid not null references public.vendor_locations(id) on delete cascade,
  title text not null check (char_length(title) between 6 and 110),
  description text not null check (char_length(description) between 10 and 500),
  redemption_code text check (redemption_code is null or (char_length(redemption_code) between 3 and 32 and redemption_code ~ '^[A-Za-z0-9_-]+$')),
  radius_m integer not null default 200 check (radius_m between 100 and 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '30 days')
);
create index if not exists nearby_offers_active_window_idx on public.nearby_offer_campaigns(starts_at, ends_at, location_id) where status='active';
create index if not exists nearby_offers_vendor_idx on public.nearby_offer_campaigns(vendor_id, created_at desc);
create table if not exists public.nearby_offer_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  enabled boolean not null default false,
  phone_notifications boolean not null default false,
  consent_version text not null default 'nearby-offers-v1',
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.nearby_offer_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  enabled boolean not null,
  phone_notifications boolean not null,
  consent_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists nearby_offer_consent_events_user_idx on public.nearby_offer_consent_events(user_id,created_at desc);
create table if not exists public.nearby_offer_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  campaign_id uuid not null references public.nearby_offer_campaigns(id) on delete cascade,
  vendor_id uuid not null references public.vendor_businesses(id) on delete cascade,
  notified_at timestamptz not null default now(),
  -- No GPS fixes, position histories, address or device tokens are persisted.
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists nearby_offer_delivery_user_idx on public.nearby_offer_delivery_log(user_id,notified_at desc);
create index if not exists nearby_offer_delivery_expiry_idx on public.nearby_offer_delivery_log(expires_at);
alter table public.nearby_offer_campaigns enable row level security;
alter table public.nearby_offer_preferences enable row level security;
alter table public.nearby_offer_consent_events enable row level security;
alter table public.nearby_offer_delivery_log enable row level security;
-- Access is restricted to trusted application transactions; no direct Data API exposure.
revoke all on table public.nearby_offer_campaigns, public.nearby_offer_preferences, public.nearby_offer_consent_events, public.nearby_offer_delivery_log from anon, authenticated, public;
comment on table public.nearby_offer_delivery_log is 'Minimal anti-spam delivery ledger, retained no more than 30 days; run daily expiry cleanup.';

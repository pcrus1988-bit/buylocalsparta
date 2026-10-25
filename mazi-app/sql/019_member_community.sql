-- MAZI 019: member-only collaboration. No commerce settlement, payments or member admission.
-- Access is ONLY through JWT-verifying mazi-member-api; never expose direct Data API grants.
create table if not exists public.mazi_marketplace_listings (
 id uuid primary key default gen_random_uuid(),
 member_user_id uuid not null references auth.users(id),
 kind text not null check (kind in ('offer','request')),
 category text not null check (category in ('goods','services','partnerships')),
 title text not null check (char_length(trim(title)) between 8 and 140),
 description text not null check (char_length(trim(description)) between 30 and 2500),
 status text not null default 'active' check (status in ('active','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists mazi_listings_status_date on public.mazi_marketplace_listings(status,created_at desc);
create index if not exists mazi_listings_owner on public.mazi_marketplace_listings(member_user_id,created_at desc);

create table if not exists public.mazi_forum_threads (
 id uuid primary key default gen_random_uuid(),
 member_user_id uuid not null references auth.users(id),
 category text not null check (category in ('general','advice','collaboration')),
 title text not null check (char_length(trim(title)) between 8 and 140),
 body text not null check (char_length(trim(body)) between 30 and 4000),
 locked boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists mazi_forum_threads_latest on public.mazi_forum_threads(created_at desc);

create table if not exists public.mazi_forum_replies (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.mazi_forum_threads(id) on delete cascade,
 member_user_id uuid not null references auth.users(id),
 body text not null check (char_length(trim(body)) between 2 and 2000),
 created_at timestamptz not null default now()
);
create index if not exists mazi_forum_replies_thread_date on public.mazi_forum_replies(thread_id,created_at asc);

create table if not exists public.mazi_chat_messages (
 id uuid primary key default gen_random_uuid(),
 channel text not null default 'lobby' check(channel='lobby'),
 member_user_id uuid not null references auth.users(id),
 body text not null check (char_length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index if not exists mazi_chat_latest on public.mazi_chat_messages(channel,created_at desc);

create table if not exists public.mazi_community_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_user_id uuid not null references auth.users(id),
 resource_type text not null check(resource_type in ('listing','thread','reply','chat')),
 resource_id uuid not null,
 reason text not null check (char_length(trim(reason)) between 20 and 500),
 created_at timestamptz not null default now(),
 unique(reporter_user_id,resource_type,resource_id)
);
create index if not exists mazi_reports_newest on public.mazi_community_reports(created_at desc);

alter table public.mazi_marketplace_listings enable row level security;
alter table public.mazi_forum_threads enable row level security;
alter table public.mazi_forum_replies enable row level security;
alter table public.mazi_chat_messages enable row level security;
alter table public.mazi_community_reports enable row level security;
-- Intentionally NO end-user policies: Edge validates getUser(JWT) AND verified ΓΕΜΗ membership.
revoke all on public.mazi_marketplace_listings,public.mazi_forum_threads,
 public.mazi_forum_replies,public.mazi_chat_messages,public.mazi_community_reports
 from PUBLIC,anon,authenticated;
grant select,insert,update on public.mazi_marketplace_listings to service_role;
grant select,insert on public.mazi_forum_threads,public.mazi_forum_replies,
 public.mazi_chat_messages,public.mazi_community_reports to service_role;
-- Only owning member may close a listing, and only through the Edge gateway.
-- Moderation and deletions remain with existing marketplace Super Admin.

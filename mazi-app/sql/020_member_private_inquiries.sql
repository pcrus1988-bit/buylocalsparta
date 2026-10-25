-- MAZI 020: private B2B inquiries tied to a real member listing.
-- No commerce, checkout, payments, financial authorization or membership changes.
create table if not exists public.mazi_listing_inquiries (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.mazi_marketplace_listings(id),
 sender_user_id uuid not null references auth.users(id),
 recipient_user_id uuid not null references auth.users(id),
 status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now(),
 unique(listing_id,sender_user_id),
 check(sender_user_id<>recipient_user_id)
);
create index if not exists mazi_inquiries_sender_date on public.mazi_listing_inquiries(sender_user_id,created_at desc);
create index if not exists mazi_inquiries_recipient_date on public.mazi_listing_inquiries(recipient_user_id,created_at desc);
create table if not exists public.mazi_inquiry_messages (
 id uuid primary key default gen_random_uuid(),
 inquiry_id uuid not null references public.mazi_listing_inquiries(id) on delete cascade,
 member_user_id uuid not null references auth.users(id),
 body text not null check(char_length(trim(body)) between 2 and 1500),
 created_at timestamptz not null default now()
);
create index if not exists mazi_inquiry_messages_order on public.mazi_inquiry_messages(inquiry_id,created_at asc);
alter table public.mazi_listing_inquiries enable row level security;
alter table public.mazi_inquiry_messages enable row level security;
revoke all on public.mazi_listing_inquiries,public.mazi_inquiry_messages from PUBLIC,anon,authenticated;
grant select,insert on public.mazi_listing_inquiries,public.mazi_inquiry_messages to service_role;
-- All members authenticate with Supabase JWT at Edge, with participant checks for every read/write.

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

-- Atomic creation: an inquiry may never exist without its opening message.
create or replace function public.mazi_open_inquiry(
 p_listing_id uuid,p_sender_user_id uuid,p_body text
) returns uuid
language plpgsql security invoker set search_path=''
as $$
declare v_recipient uuid;v_id uuid;
begin
 if char_length(trim(p_body)) not between 20 and 1500 then
  raise exception 'MAZI_INQUIRY_MESSAGE_INVALID' using errcode='22023';
 end if;
 select l.member_user_id into v_recipient
 from public.mazi_marketplace_listings l
 join public.mazi_members member on member.user_id=l.member_user_id
 join public.mazi_membership_applications application
   on application.applicant_user_id=member.user_id and application.status='approved'
 where l.id=p_listing_id and l.status='active' and
   l.member_user_id<>p_sender_user_id and member.status='verified'
   and member.identity_verified_at is not null
 for share of l;
 if v_recipient is null then
  raise exception 'MAZI_LISTING_UNAVAILABLE' using errcode='23503';
 end if;
 if not exists(
  select 1 from public.mazi_members member
  join public.mazi_membership_applications application
    on application.applicant_user_id=member.user_id and application.status='approved'
  where member.user_id=p_sender_user_id and member.status='verified'
    and member.identity_verified_at is not null
 ) then raise exception 'MAZI_SENDER_NOT_VERIFIED' using errcode='42501';
 end if;
 insert into public.mazi_listing_inquiries(listing_id,sender_user_id,recipient_user_id)
 values(p_listing_id,p_sender_user_id,v_recipient) returning id into v_id;
 insert into public.mazi_inquiry_messages(inquiry_id,member_user_id,body)
 values(v_id,p_sender_user_id,trim(p_body));
 return v_id;
end $$;
revoke all on function public.mazi_open_inquiry(uuid,uuid,text) from PUBLIC,anon,authenticated;
grant execute on function public.mazi_open_inquiry(uuid,uuid,text) to service_role;

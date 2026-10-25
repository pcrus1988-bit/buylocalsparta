-- MAZI 024: persistent private-inbox read state, latest activity and closure.
-- Permission invariant: only Supabase Edge service role can invoke the member RPCs.
alter table public.mazi_listing_inquiries
 add column if not exists sender_last_read_at timestamptz,
 add column if not exists recipient_last_read_at timestamptz,
 add column if not exists last_message_at timestamptz,
 add column if not exists last_message_user_id uuid references auth.users(id),
 add column if not exists closed_at timestamptz,
 add column if not exists closed_by_user_id uuid references auth.users(id);

-- Backfill on the actual data, never seed synthetic conversations.
update public.mazi_listing_inquiries i
set last_message_at=latest.created_at,last_message_user_id=latest.member_user_id
from lateral (
 select inquiry_id,created_at,member_user_id
 from public.mazi_inquiry_messages
 order by created_at desc,id desc
) latest
where latest.inquiry_id=i.id and not exists (
 select 1 from public.mazi_inquiry_messages newer
 where newer.inquiry_id=i.id and
  (newer.created_at,newer.id)>(latest.created_at,latest.inquiry_id)
) and i.last_message_at is null;

-- An append is permitted only in an open conversation by an approved KYB member.
-- The parent row is locked so closing and replying cannot race.
create or replace function mazi_private.guard_private_inquiry_message()
returns trigger language plpgsql security invoker set search_path='' as $$
declare current_inquiry record;
begin
 select sender_user_id,recipient_user_id,status into current_inquiry
 from public.mazi_listing_inquiries where id=new.inquiry_id for update;
 if not found or current_inquiry.status<>'open' or
    new.member_user_id not in(current_inquiry.sender_user_id,current_inquiry.recipient_user_id)
 then raise exception 'MAZI_INQUIRY_NOT_AVAILABLE'; end if;
 if not exists (
  select 1 from public.mazi_members member
  join public.mazi_membership_applications app
   on app.id=member.application_id and app.applicant_user_id=member.user_id
  where member.user_id=new.member_user_id and member.status='verified'
   and member.identity_verified_at is not null and member.gemi_number is not null
   and app.status='approved'
 ) then raise exception 'MAZI_INQUIRY_MEMBER_NOT_VERIFIED'; end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('mazi-private-msg:'||new.member_user_id::text, 2187));
 if exists (select 1 from public.mazi_inquiry_messages msg
   where msg.member_user_id=new.member_user_id
     and msg.created_at>now()-interval '5 seconds')
 then raise exception 'MAZI_INQUIRY_RATE_LIMIT'; end if;
 return new;
end $$;
create or replace function mazi_private.record_private_inquiry_activity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.mazi_listing_inquiries
 set last_message_at=new.created_at,last_message_user_id=new.member_user_id
 where id=new.inquiry_id and
  (last_message_at is null or last_message_at<=new.created_at);
 return null;
end $$;
drop trigger if exists mazi_inquiry_message_validate on public.mazi_inquiry_messages;
create trigger mazi_inquiry_message_validate before insert on public.mazi_inquiry_messages
 for each row execute function mazi_private.guard_private_inquiry_message();
drop trigger if exists mazi_inquiry_activity on public.mazi_inquiry_messages;
create trigger mazi_inquiry_activity after insert on public.mazi_inquiry_messages
 for each row execute function mazi_private.record_private_inquiry_activity();

create or replace function public.mazi_inquiry_member_action(
 p_inquiry_id uuid,p_actor_user_id uuid,p_action text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare entry record;
begin
 if p_action not in ('read','close') or p_inquiry_id is null or p_actor_user_id is null
 then return false;end if;
 select sender_user_id,recipient_user_id,status into entry
 from public.mazi_listing_inquiries where id=p_inquiry_id for update;
 if not found or p_actor_user_id not in(entry.sender_user_id,entry.recipient_user_id)
 then return false;end if;
 -- The calling Edge validates Auth JWT and live member status; assert KYB again.
 if not exists (
   select 1 from public.mazi_members member
   join public.mazi_membership_applications app
    on app.id=member.application_id and app.applicant_user_id=member.user_id
   where member.user_id=p_actor_user_id and member.status='verified'
    and member.identity_verified_at is not null and member.gemi_number is not null
    and app.status='approved'
 ) then return false;end if;
 if p_action='read' then
  update public.mazi_listing_inquiries set
   sender_last_read_at=case when sender_user_id=p_actor_user_id then now() else sender_last_read_at end,
   recipient_last_read_at=case when recipient_user_id=p_actor_user_id then now() else recipient_last_read_at end
  where id=p_inquiry_id;
 elsif p_action='close' and entry.status='open' then
  update public.mazi_listing_inquiries
   set status='closed',closed_at=now(),closed_by_user_id=p_actor_user_id
  where id=p_inquiry_id;
 else return false; end if;
 return true;
end $$;
revoke all on function public.mazi_inquiry_member_action(uuid,uuid,text)
 from PUBLIC,anon,authenticated;
grant execute on function public.mazi_inquiry_member_action(uuid,uuid,text) to service_role;
grant select,insert,update on public.mazi_listing_inquiries to service_role;
grant select,insert on public.mazi_inquiry_messages to service_role;
revoke all on public.mazi_listing_inquiries,public.mazi_inquiry_messages from PUBLIC,anon,authenticated;
create index if not exists mazi_inbox_sender_recent
 on public.mazi_listing_inquiries(sender_user_id,last_message_at desc);
create index if not exists mazi_inbox_recipient_recent
 on public.mazi_listing_inquiries(recipient_user_id,last_message_at desc);

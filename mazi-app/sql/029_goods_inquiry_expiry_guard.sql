-- MAZI 029: atomic active, physical, unexpired, visible listing requirement.
-- MAZI 022: reject hidden listings atomically when creating a private inquiry.
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
 where l.id=p_listing_id and l.status='active' and l.hidden_at is null
   and l.category='goods' and l.expires_at>now() and
   l.member_user_id<>p_sender_user_id and member.status='verified'
   and member.identity_verified_at is not null and member.gemi_number is not null
 for share of l;
 if v_recipient is null then
  raise exception 'MAZI_LISTING_UNAVAILABLE' using errcode='23503';
 end if;
 if not exists(
  select 1 from public.mazi_members member
  join public.mazi_membership_applications application
    on application.applicant_user_id=member.user_id and application.status='approved'
  where member.user_id=p_sender_user_id and member.status='verified'
    and member.identity_verified_at is not null and member.gemi_number is not null
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

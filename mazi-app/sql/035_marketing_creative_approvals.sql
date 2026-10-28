-- MAZI marketing v3: in-platform, member-specific creative review; no advertising execution.
-- Distinct from the Growth Fund, tokens and marketing money. No provider integration.
create table if not exists public.mazi_marketing_creative_invitations (
 id uuid primary key default gen_random_uuid(),
 brief_id uuid not null references public.mazi_marketing_briefs(id),
 member_user_id uuid not null references public.mazi_members(user_id),
 campaign_title text not null check (char_length(btrim(campaign_title)) between 8 and 140),
 channel text not null check (channel in ('social','search','marketplace','local_media','print','event')),
 creative_text text not null check (char_length(btrim(creative_text)) between 20 and 1500),
 asset_description text not null default '' check (char_length(asset_description)<=500),
 destination_url text not null check (destination_url ~ '^https://(www\.)?kontamou\.site(/|$)'),
 rights_scope text not null default 'creative-preview-v1'
   check (rights_scope='creative-preview-v1'),
 status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn','revoked')),
 response_note text not null default '' check (char_length(response_note)<=500),
 invited_by uuid not null references public.users(id),
 last_actor_id uuid references public.users(id),
 responded_at timestamptz,
 expires_at timestamptz not null default (now()+interval '14 days'),
 created_at timestamptz not null default now(),
 unique(brief_id,member_user_id),
 check (expires_at>created_at)
);
create index if not exists mazi_marketing_invite_member_idx
 on public.mazi_marketing_creative_invitations(member_user_id,created_at desc);
create index if not exists mazi_marketing_invite_brief_idx
 on public.mazi_marketing_creative_invitations(brief_id,status);
alter table public.mazi_marketing_creative_invitations enable row level security;
revoke all on public.mazi_marketing_creative_invitations from PUBLIC,anon,authenticated,service_role;
grant select on public.mazi_marketing_creative_invitations to authenticated;
grant update(status,response_note) on public.mazi_marketing_creative_invitations to authenticated;
create policy mazi_marketing_invites_self_read on public.mazi_marketing_creative_invitations
 for select to authenticated using (member_user_id=(select auth.uid()));
create policy mazi_marketing_invites_self_update on public.mazi_marketing_creative_invitations
 for update to authenticated
 using (member_user_id=(select auth.uid()) and status in ('pending','approved'))
 with check (member_user_id=(select auth.uid()) and status in ('approved','declined','withdrawn'));

create table if not exists public.mazi_marketing_creative_events (
 id bigint generated always as identity primary key,
 invitation_id uuid not null references public.mazi_marketing_creative_invitations(id),
 event_kind text not null check (event_kind in ('issued','approved','declined','withdrawn','revoked')),
 actor_user_id uuid not null references public.users(id),
 event_at timestamptz not null default now(),
 snapshot jsonb not null
);
create index if not exists mazi_marketing_creative_events_invite_idx on
 public.mazi_marketing_creative_events(invitation_id,event_at desc);
alter table public.mazi_marketing_creative_events enable row level security;
revoke all on public.mazi_marketing_creative_events from PUBLIC,anon,authenticated,service_role;
grant select on public.mazi_marketing_creative_events to authenticated;
create policy mazi_marketing_creative_events_self_read on public.mazi_marketing_creative_events
 for select to authenticated using (
 exists (select 1 from public.mazi_marketing_creative_invitations inv
 where inv.id=invitation_id and inv.member_user_id=(select auth.uid()))
 );

create or replace function mazi_private.mazi_marketing_creative_change_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_actor uuid;
begin
 if tg_op='DELETE' then raise exception 'MAZI_MARKETING_CREATIVE_NO_DELETE'; end if;
 v_actor:=auth.uid();
 if to_jsonb(new) - 'status' - 'response_note' - 'responded_at' - 'last_actor_id'
    is distinct from
    to_jsonb(old) - 'status' - 'response_note' - 'responded_at' - 'last_actor_id' then
    raise exception 'MAZI_MARKETING_CREATIVE_IMMUTABLE';
 end if;
 if new.status=old.status then raise exception 'MAZI_MARKETING_CREATIVE_CHANGE_REQUIRED'; end if;
 if v_actor is not null then
   if new.member_user_id<>v_actor then raise exception 'MAZI_MARKETING_WRONG_MEMBER'; end if;
   if not ((old.status='pending' and new.status in ('approved','declined'))
      or (old.status='approved' and new.status='withdrawn')) then
      raise exception 'MAZI_MARKETING_MEMBER_TRANSITION_FORBIDDEN';
   end if;
   if old.status='pending' and old.expires_at<=now() then
     raise exception 'MAZI_MARKETING_INVITATION_EXPIRED';
   end if;
   if new.status='approved' and not exists (
     select 1 from public.mazi_members m
     join public.mazi_membership_applications a on a.id=m.application_id
     where m.user_id=v_actor and m.status='verified' and m.identity_verified_at is not null
     and a.status='approved'
   ) then raise exception 'MAZI_MARKETING_MEMBERSHIP_NOT_VERIFIED'; end if;
   new.last_actor_id:=v_actor;
 else
   if not (old.status in ('pending','approved') and new.status='revoked')
     then raise exception 'MAZI_MARKETING_ADMIN_TRANSITION_FORBIDDEN'; end if;
   if new.last_actor_id is null then raise exception 'MAZI_MARKETING_ADMIN_ACTOR_REQUIRED'; end if;
 end if;
 new.responded_at:=now();
 return new;
end; $$;
create or replace function mazi_private.mazi_marketing_creative_audit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.mazi_marketing_creative_events
  (invitation_id,event_kind,actor_user_id,snapshot)
 values (new.id, case when tg_op='INSERT' then 'issued' else new.status end,
  case when tg_op='INSERT' then new.invited_by else new.last_actor_id end, to_jsonb(new));
 return new;
end; $$;
create or replace function mazi_private.mazi_marketing_creative_event_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'MAZI_MARKETING_CREATIVE_AUDIT_APPEND_ONLY'; end; $$;
revoke all on function mazi_private.mazi_marketing_creative_change_guard() from PUBLIC,anon,authenticated;
revoke all on function mazi_private.mazi_marketing_creative_audit() from PUBLIC,anon,authenticated;
revoke all on function mazi_private.mazi_marketing_creative_event_guard() from PUBLIC,anon,authenticated;
drop trigger if exists mazi_marketing_creative_guard on public.mazi_marketing_creative_invitations;
create trigger mazi_marketing_creative_guard before update or delete
 on public.mazi_marketing_creative_invitations for each row
 execute function mazi_private.mazi_marketing_creative_change_guard();
drop trigger if exists mazi_marketing_creative_audit on public.mazi_marketing_creative_invitations;
create trigger mazi_marketing_creative_audit after insert or update
 on public.mazi_marketing_creative_invitations for each row
 execute function mazi_private.mazi_marketing_creative_audit();
drop trigger if exists mazi_marketing_creative_events_immutable on public.mazi_marketing_creative_events;
create trigger mazi_marketing_creative_events_immutable before update or delete
 on public.mazi_marketing_creative_events for each row
 execute function mazi_private.mazi_marketing_creative_event_guard();

-- The server-side Super Admin must additionally validate verified membership,
-- voluntary channel preference and review-status brief before writing proposals.
-- No automatic ad publication, budget deduction or external sends.

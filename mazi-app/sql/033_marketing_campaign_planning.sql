-- MAZI marketing v2. Planning only: no payments, campaign launch, member ad wallets or advertising spend.
-- The existing fund ledger and member service Tokens remain completely separate.
create table if not exists public.mazi_marketing_briefs (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(btrim(title)) between 8 and 140),
 objective text not null check (char_length(btrim(objective)) between 30 and 2000),
 channel text not null check (channel in ('social','search','marketplace','local_media','print','event')),
 region text not null check (char_length(btrim(region)) between 2 and 120),
 target_sector text not null check (char_length(btrim(target_sector)) between 2 and 120),
 proposed_budget_cents bigint not null default 0 check (proposed_budget_cents between 0 and 100000000),
 starts_on date, ends_on date,
 status text not null default 'draft' check (status in ('draft','review','archived')),
 created_by uuid not null references public.users(id),
 updated_by uuid not null references public.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint mazi_marketing_dates_check check (starts_on is null or ends_on is null or starts_on <= ends_on)
);
create index if not exists mazi_marketing_briefs_status_date
 on public.mazi_marketing_briefs(status,created_at desc);
alter table public.mazi_marketing_briefs enable row level security;
revoke all on public.mazi_marketing_briefs from PUBLIC,anon,authenticated,service_role;

create table if not exists public.mazi_marketing_brief_events (
 id bigint generated always as identity primary key,
 brief_id uuid not null references public.mazi_marketing_briefs(id),
 event_kind text not null check (event_kind in ('created','revised')),
 actor_user_id uuid not null references public.users(id),
 recorded_at timestamptz not null default now(),
 snapshot jsonb not null
);
create index if not exists mazi_marketing_brief_events_brief
 on public.mazi_marketing_brief_events(brief_id,recorded_at desc);
alter table public.mazi_marketing_brief_events enable row level security;
revoke all on public.mazi_marketing_brief_events from PUBLIC,anon,authenticated,service_role;

create or replace function mazi_private.mazi_marketing_brief_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'MAZI_MARKETING_NO_DELETE'; end if;
 if new.id is distinct from old.id or new.created_by is distinct from old.created_by
  or new.created_at is distinct from old.created_at then
  raise exception 'MAZI_MARKETING_IMMUTABLE_IDENTITY';
 end if;
 if old.status='archived' then raise exception 'MAZI_MARKETING_ARCHIVED_IMMUTABLE'; end if;
 if new.status is distinct from old.status and not (
   (old.status='draft' and new.status in ('review','archived'))
   or (old.status='review' and new.status in ('draft','archived'))
 ) then raise exception 'MAZI_MARKETING_INVALID_TRANSITION'; end if;
 new.updated_at=now();
 return new;
end; $$;
create or replace function mazi_private.mazi_marketing_brief_audit()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.mazi_marketing_brief_events (brief_id,event_kind,actor_user_id,snapshot)
 values(new.id,case when TG_OP='INSERT' then 'created' else 'revised' end,
 new.updated_by,to_jsonb(new));
 return new;
end; $$;
create or replace function mazi_private.mazi_marketing_event_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'MAZI_MARKETING_AUDIT_APPEND_ONLY'; end; $$;
revoke all on function mazi_private.mazi_marketing_brief_guard() from PUBLIC,anon,authenticated;
revoke all on function mazi_private.mazi_marketing_brief_audit() from PUBLIC,anon,authenticated;
revoke all on function mazi_private.mazi_marketing_event_guard() from PUBLIC,anon,authenticated;
drop trigger if exists mazi_marketing_guard on public.mazi_marketing_briefs;
create trigger mazi_marketing_guard before update or delete on public.mazi_marketing_briefs
 for each row execute function mazi_private.mazi_marketing_brief_guard();
drop trigger if exists mazi_marketing_audit on public.mazi_marketing_briefs;
create trigger mazi_marketing_audit after insert or update on public.mazi_marketing_briefs
 for each row execute function mazi_private.mazi_marketing_brief_audit();
drop trigger if exists mazi_marketing_audit_immutable on public.mazi_marketing_brief_events;
create trigger mazi_marketing_audit_immutable before update or delete on public.mazi_marketing_brief_events
 for each row execute function mazi_private.mazi_marketing_event_guard();

-- Voluntary, authenticated MAZI member planning preferences; never email-marketing permission.
create table if not exists public.mazi_marketing_preferences (
 member_user_id uuid primary key references public.mazi_members(user_id) on delete cascade,
 wants_collective_campaigns boolean not null default false,
 channels text[] not null default '{}'::text[]
  check (channels <@ array['social','search','marketplace','local_media','print','event']::text[]
   and cardinality(channels)<=6),
 region text not null default '' check (char_length(region)<=120),
 member_note text not null default '' check (char_length(member_note)<=1000),
 notice_version text not null default 'mazi-marketing-interest-v1'
  check (notice_version='mazi-marketing-interest-v1'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.mazi_marketing_preferences enable row level security;
revoke all on public.mazi_marketing_preferences from PUBLIC,anon,authenticated;
grant select,insert,update on public.mazi_marketing_preferences to authenticated;
grant select,insert,update,delete on public.mazi_marketing_preferences to service_role;
create policy mazi_marketing_preference_self_read on public.mazi_marketing_preferences
 for select to authenticated using ((select auth.uid())=member_user_id);
create policy mazi_marketing_preference_self_insert on public.mazi_marketing_preferences
 for insert to authenticated with check (
 member_user_id=(select auth.uid()) and exists (
 select 1 from public.mazi_members m
 join public.mazi_membership_applications a on a.id=m.application_id
 where m.user_id=(select auth.uid()) and m.status='verified'
 and m.identity_verified_at is not null and a.status='approved'));
create policy mazi_marketing_preference_self_update on public.mazi_marketing_preferences
 for update to authenticated using (
 member_user_id=(select auth.uid()) and exists (
 select 1 from public.mazi_members m
 join public.mazi_membership_applications a on a.id=m.application_id
 where m.user_id=(select auth.uid()) and m.status='verified'
 and m.identity_verified_at is not null and a.status='approved'))
 with check (
 member_user_id=(select auth.uid()) and notice_version='mazi-marketing-interest-v1'
 and exists (select 1 from public.mazi_members m
 join public.mazi_membership_applications a on a.id=m.application_id
 where m.user_id=(select auth.uid()) and m.status='verified'
 and m.identity_verified_at is not null and a.status='approved'));
create or replace function mazi_private.mazi_marketing_preference_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.member_user_id is distinct from old.member_user_id
 or new.created_at is distinct from old.created_at then
 raise exception 'MAZI_MARKETING_PREFERENCE_IDENTITY_IMMUTABLE'; end if;
 new.updated_at=now();
 return new;
end; $$;
revoke all on function mazi_private.mazi_marketing_preference_guard() from PUBLIC,anon,authenticated;
drop trigger if exists mazi_marketing_preferences_guard on public.mazi_marketing_preferences;
create trigger mazi_marketing_preferences_guard before update on public.mazi_marketing_preferences
 for each row execute function mazi_private.mazi_marketing_preference_guard();

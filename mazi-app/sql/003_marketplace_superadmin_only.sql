-- 003: MAZI has no independently appointed administrators.
-- All administrative changes must originate from the existing authenticated
-- KONTA MOY marketplace super_admin workspace (server-side Postgres only).
-- Non-destructive: leaves old table in place but disables its authorization.
create or replace function public.mazi_is_administrator()
returns boolean language sql stable
set search_path = ''
as $$ select false; $$;
revoke execute on function public.mazi_review_application(uuid,boolean) from authenticated;
revoke execute on function public.mazi_is_administrator() from authenticated;
alter table public.mazi_audit_events
  add column if not exists marketplace_actor_user_id uuid references public.users(id);
create index if not exists mazi_audit_marketplace_actor_created_idx
  on public.mazi_audit_events(marketplace_actor_user_id,happened_at desc)
  where marketplace_actor_user_id is not null;
-- No direct MAZI administrator account can be granted by ordinary users.
revoke all on public.mazi_administrators from anon, authenticated;
-- MAZI audit history must remain append-only even for the marketplace writer.
create or replace function public.mazi_reject_audit_changes()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'MAZI_AUDIT_APPEND_ONLY'; end; $$;
revoke all on function public.mazi_reject_audit_changes() from public,anon,authenticated;
drop trigger if exists mazi_audit_events_immutable on public.mazi_audit_events;
create trigger mazi_audit_events_immutable
before update or delete on public.mazi_audit_events
for each row execute function public.mazi_reject_audit_changes();

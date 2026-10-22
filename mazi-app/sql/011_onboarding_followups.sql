-- MAZI / 011: real Super Admin follow-up and private member response.
-- New table only; no marketplace data updates or synthetic intake records.
create table if not exists public.mazi_application_followups(
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.mazi_membership_applications(id),
 question text not null check(char_length(trim(question)) between 20 and 1000),
 requested_by uuid not null references public.users(id),
 requested_at timestamptz not null default now(),
 answer text,
 answered_at timestamptz,
 constraint mazi_followup_answer_integrity check(
   (answer is null and answered_at is null) or
   (answer is not null and answered_at is not null
     and char_length(trim(answer)) between 20 and 2000))
);
create unique index if not exists mazi_application_one_open_followup
 on public.mazi_application_followups(application_id)
 where answered_at is null;
create index if not exists mazi_application_followup_recent
 on public.mazi_application_followups(application_id,requested_at desc);
alter table public.mazi_application_followups enable row level security;
revoke all on public.mazi_application_followups from anon,authenticated,service_role;
grant select on public.mazi_application_followups to service_role;
grant update(answer,answered_at) on public.mazi_application_followups to service_role;

-- Prevent any caller (including the narrowly permitted Edge service key)
-- from altering a question, applicant, reviewer, timestamp, or previous reply.
create or replace function public.mazi_guard_followup_answer()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.answered_at is not null or old.answer is not null
    or new.id is distinct from old.id
    or new.application_id is distinct from old.application_id
    or new.question is distinct from old.question
    or new.requested_by is distinct from old.requested_by
    or new.requested_at is distinct from old.requested_at
    or new.answered_at is null or new.answer is null
    or char_length(trim(new.answer)) not between 20 and 2000
    or not exists(
      select 1 from public.mazi_membership_applications a
      where a.id=old.application_id and a.status='pending'
    )
  then
    raise exception 'MAZI_FOLLOWUP_IMMUTABLE_OR_CLOSED' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function public.mazi_guard_followup_answer() from public,anon,authenticated;
drop trigger if exists mazi_followup_answer_guard on public.mazi_application_followups;
create trigger mazi_followup_answer_guard before update
 on public.mazi_application_followups
 for each row execute function public.mazi_guard_followup_answer();

-- Every answer is a real business event. No user content is copied into
-- the audit event; the question/reply stay in the restricted source table.
create or replace function public.mazi_audit_followup_answer()
returns trigger language plpgsql security definer set search_path='' as $$
declare applicant uuid;
begin
 select a.applicant_user_id into applicant
 from public.mazi_membership_applications a where a.id=new.application_id;
 insert into public.mazi_audit_events(actor_user_id,entity_type,entity_id,action,evidence)
 values(applicant,'application_followup',new.id,'answered',
    jsonb_build_object('application_id',new.application_id));
 return new;
end; $$;
revoke all on function public.mazi_audit_followup_answer() from public,anon,authenticated;
drop trigger if exists mazi_followup_answer_audit on public.mazi_application_followups;
create trigger mazi_followup_answer_audit after update
 on public.mazi_application_followups for each row
 execute function public.mazi_audit_followup_answer();

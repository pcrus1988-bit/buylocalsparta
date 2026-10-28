-- 037: Evidence-backed, append-only public project progress.
-- This is NOT a payment API and does not claim evidence without Super Admin review.
create table if not exists public.mazi_fund_project_updates(
 id uuid primary key default gen_random_uuid(),
 offer_id uuid not null references public.mazi_grant_award_offers(id),
 update_kind text not null check(update_kind in ('milestone','evidence_verified','completion','correction')),
 public_summary text not null check(length(btrim(public_summary)) between 50 and 750),
 evidence_sha256 text check(evidence_sha256 is null or evidence_sha256~'^[a-f0-9]{64}$'),
 private_evidence_reference text,
 supersedes_id uuid references public.mazi_fund_project_updates(id),
 reviewed_by uuid not null references public.users(id),
 published_at timestamptz not null default now(),
 check(private_evidence_reference is null or length(private_evidence_reference) between 8 and 300),
 check(update_kind not in ('evidence_verified','completion') or evidence_sha256 is not null),
 check((update_kind='correction')=(supersedes_id is not null))
);
create index if not exists mazi_fund_project_updates_offer_idx
 on public.mazi_fund_project_updates(offer_id,published_at,id);
create unique index if not exists mazi_fund_project_updates_single_correction
 on public.mazi_fund_project_updates(supersedes_id) where supersedes_id is not null;
alter table public.mazi_fund_project_updates enable row level security;
revoke all on public.mazi_fund_project_updates from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_project_updates_immutable on public.mazi_fund_project_updates;
create trigger mazi_fund_project_updates_immutable before update or delete
 on public.mazi_fund_project_updates for each row
 execute function public.mazi_immutable_row();

create or replace function mazi_private.validate_fund_project_update()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
 offer record;
 prior record;
begin
 if tg_op<>'INSERT' then raise exception 'MAZI_PROGRESS_APPEND_ONLY'; end if;
 select a.id,a.proposal_id,a.cycle_id,c.kind,c.status,c.finance_activated,
        ack.affirmatively_accepted
 into offer
 from public.mazi_grant_award_offers a
 join public.mazi_cycles c on c.id=a.cycle_id
 left join public.mazi_grant_award_acknowledgements ack on ack.offer_id=a.id
 where a.id=new.offer_id for share of a;
 if not found or offer.kind<>'fund_allocation' or offer.status<>'closed'
  or offer.finance_activated is distinct from true
  or offer.affirmatively_accepted is distinct from true then
  raise exception 'MAZI_PROGRESS_REQUIRES_ACCEPTED_FINANCIAL_GRANT' using errcode='23514';
 end if;
 if new.supersedes_id is not null then
  select id,offer_id into prior from public.mazi_fund_project_updates where id=new.supersedes_id;
  if not found or prior.offer_id<>new.offer_id then
   raise exception 'MAZI_PROGRESS_CORRECTION_SCOPE_INVALID' using errcode='23514';
  end if;
 end if;
 new.published_at:=now();
 return new;
end;$$;
revoke all on function mazi_private.validate_fund_project_update() from public,anon,authenticated,service_role;
drop trigger if exists mazi_fund_project_updates_guard on public.mazi_fund_project_updates;
create trigger mazi_fund_project_updates_guard before insert
 on public.mazi_fund_project_updates for each row
 execute function mazi_private.validate_fund_project_update();

create or replace function public.mazi_fund_public_project_updates()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'offer_id',h.offer_id,'cycle_slug',h.cycle_slug,
  'proposal_title',h.proposal_title,'assigned_amount_cents',h.assigned_amount_cents,
  'update_kind',h.update_kind,'summary',h.public_summary,
  'evidence_sha256',h.evidence_sha256,'supersedes_id',h.supersedes_id,
  'published_at',h.published_at
 ) order by h.published_at desc,h.id desc),'[]'::jsonb)
 from(
  select u.id,u.offer_id,c.slug as cycle_slug,p.title as proposal_title,
   a.assigned_amount_cents,u.update_kind,u.public_summary,
   u.evidence_sha256,u.supersedes_id,u.published_at
  from public.mazi_fund_project_updates u
  join public.mazi_grant_award_offers a on a.id=u.offer_id
  join public.mazi_grant_award_acknowledgements ack on ack.offer_id=a.id
   and ack.affirmatively_accepted=true
  join public.mazi_proposals p on p.id=a.proposal_id
  join public.mazi_cycles c on c.id=a.cycle_id and c.kind='fund_allocation' and c.status='closed'
  order by u.published_at desc,u.id desc
  limit 200
 ) h;
$$;
revoke all on function public.mazi_fund_public_project_updates() from public,anon,authenticated;
grant execute on function public.mazi_fund_public_project_updates() to service_role;

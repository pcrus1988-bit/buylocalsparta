-- Private reviewer working set: only the current valid immutable snapshot.
-- Never published through public PostgREST or the NYXI consumer API.
create schema if not exists nyxi_internal;
revoke all on schema nyxi_internal from public, anon, authenticated;
grant usage on schema nyxi_internal to service_role;

create or replace view nyxi_internal.current_fragment_review_queue_v1
with (security_barrier=true) as
select
  f.id as fragment_id,
  f.source_id,
  s.source_key,
  s.title as source_title,
  s.authority,
  f.snapshot_id,
  v.sha256 as snapshot_sha256,
  v.final_url,
  f.ordinal,
  f.section_heading,
  f.body_text,
  f.content_sha256,
  f.evidence_class,
  f.extraction_method,
  f.created_at
from public.nyxi_evidence_fragments f
join public.nyxi_valid_snapshots_v1 v
  on v.snapshot_id = f.snapshot_id and v.source_id = f.source_id
join public.nyxi_sources s on s.id = f.source_id
where s.status = 'active'
  and v.latest_snapshot is true
  and (f.metadata->>'review_required') = 'true'
  and coalesce(f.metadata->>'review_status', 'pending') = 'pending'
  and exists (
    select 1 from public.nyxi_extraction_runs r
    where r.snapshot_id = f.snapshot_id
      and r.source_id = f.source_id
      and r.status = 'complete'
  )
  and not exists (
    select 1 from public.nyxi_fragment_publication_approvals a
    where a.fragment_id = f.id and a.revoked_at is null
  );

revoke all on nyxi_internal.current_fragment_review_queue_v1 from public, anon, authenticated;
grant select on nyxi_internal.current_fragment_review_queue_v1 to service_role;

comment on view nyxi_internal.current_fragment_review_queue_v1 is
  'PRIVATE service_role-only review candidates from current valid snapshots; no approval or public publication is implied.';

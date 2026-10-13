-- Service-role-only rights assessment queue for active NYXI source references.
-- This is NOT an authorization to acquire, crawl, mirror or publish content.
create or replace view nyxi_internal.source_rights_review_queue_v1
with (security_barrier=true) as
select
  s.id as source_id,
  s.source_key,
  s.title,
  s.authority,
  s.jurisdiction,
  s.canonical_url,
  s.source_role,
  s.priority,
  s.acquisition_method,
  s.status
from public.nyxi_sources s
where s.status = 'active'
  and not exists (
    select 1
    from public.nyxi_asset_acquisition_approvals a
    where a.source_id = s.id
      and a.acquisition_authorized is true
      and a.approved_at is not null
      and a.asset_url = s.canonical_url
      and a.expires_at > now()
      and a.review_due_at > now()
      and (a.retention_until is null or a.retention_until > now())
  );

revoke all on nyxi_internal.source_rights_review_queue_v1 from public, anon, authenticated;
grant select on nyxi_internal.source_rights_review_queue_v1 to service_role;

comment on view nyxi_internal.source_rights_review_queue_v1 is
  'PRIVATE active NYXI sources awaiting a valid independently documented asset acquisition authorization. No implied permission to ingest.';

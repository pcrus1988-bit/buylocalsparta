-- NYXI: read-only chain audit; exact asset approvals are mandatory.
select count(*) as snapshots,
 count(*) filter(where a.id is null or a.source_id<>s.source_id or
   s.final_url<>a.asset_url or s.final_url<>a.approved_final_url or
   m.source_id<>s.source_id or m.metadata->>'asset_approval_id'<>a.id::text
   or s.sha256 !~ '^[0-9a-f]{64}$') as broken_chains
from public.nyxi_source_snapshots s
left join public.nyxi_corpus_manifest m on m.snapshot_id=s.id
left join public.nyxi_asset_acquisition_approvals a
 on a.id::text=s.provenance->>'asset_approval_id';

-- Read-only rights audit. No rights are granted by this query.
select (select count(*) from public.nyxi_sources) as source_count,
       (select count(*) from public.nyxi_source_snapshots) as snapshot_count,
       (select count(*) from public.nyxi_evidence_fragments) as private_fragment_count,
       (select count(*) from public.nyxi_fragment_publication_approvals where revoked_at is null) as publication_approval_count,
       (select count(*) from public.nyxi_search_documents_v1) as searchable_document_count;

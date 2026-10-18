# NYXI private HTML extractor — production v7

This directory versions the deployed Supabase function `nyxi-private-extractor` at production project `eemihhfreggbigxejjhj`.

## Security and provenance

- Internal-only scheduler token checked against stored SHA-256 before any snapshot is accessed; only the service role reads private archive objects.
- Exact source and immutable original SHA-256/size verified; only HTML/XHTML snapshots whose manifest state is `ready` can enter HTML extraction.
- Evidence fragments are private, deduplicated per snapshot, and marked `review_required=true`. **No publication, product safety claim, or Drive mirror is authorized by extraction.**
- Once the extraction run is completed, the manifest is marked `complete`. When an already-completed run is observed with a legacy `ready` manifest, it is repaired to `complete` without re-extracting.
- A manifest write failure now returns `manifest_finalize_failed` rather than reporting full success; original snapshot records are not modified.

## Production reconciliation performed 18 Oct 2026

Legacy manifest `ready` states included 106 completed HTML v2 runs and 8 completed v1/XHTML runs. Every run's fragment count and archived SHA were checked before 114 manifests were marked complete. Counts went from 114 stale `ready` records to zero, allowing the scheduled collector to avoid 114 repeated completion queries on every interval.

This did not approve source fragments, populate the public knowledge index or create any Drive mirror. `nyxi_reviewed_fragments_v1` remained empty following reconciliation. All publication still requires separate exact asset and fragment approval.

## Test

Verify source code and token auth. Inspect the existing PDF/HTML manifests and compare finished extraction counts with fragments, then trigger `public.nyxi_run_acquisition_schedule()` against an approved new source and confirm the run and manifest both reach `complete`. Check that unreviewed fragments do not appear in `nyxi_search_documents_v1`.

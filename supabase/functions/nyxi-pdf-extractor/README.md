# NYXI private PDF extraction — v1

The `nyxi-pdf-extractor` production function processes **only previously archived, exact-approved, immutable PDF evidence**. It never crawls links or performs OCR. This is the second stage after `nyxi-evidence-collector` (which preserves SHA-256 original bytes).

* Every request authenticates using the existing hash-verified scheduler token. `verify_jwt=false` is intentional because this is an internal cron dispatch with a separate mandatory token. No browser-facing access.
* Resolve snapshot, corpus manifest, and active asset-specific rights approval, then independently hash the private source bytes. Reject wrong length, MIME, magic, source, provenance, or expired review.
* Use pinned `npm:unpdf@1.8.1` (serverless PDF.js); never execute PDF scripts; do not render images. Bound input to 25 MiB, 600 pages, 10 pages/run, 125k characters/page, 1,300 characters/evidence fragment.
* `public.nyxi_pdf_claim_v1` issues an exclusive 3-minute lease for each snapshot and denies concurrent attempts; releases require matching snapshot/token. Database table/function are private to `service_role` and RLS-enabled with no public policies.
* Resume cursor lives in `nyxi_extraction_runs.metadata.next_page`. Fragment keys include exact page and ordinal, with insert-on-conflict ignored for retries. Each fragment has `review_status=pending`, `review_required=true`, `no_claims_approved=true` and a SHA-256 hash. **No publication or Drive mirror is granted**.
* The original source snapshot row remains immutable. Completion is reflected in `nyxi_extraction_runs.status=complete` and `nyxi_corpus_manifest.extraction_status=complete`. A PDF without a text layer moves to manual OCR/review. Page text is provisional, not a finding or regulatory determination.
* The original worker continues to handle HTML as before and selects one PDF at a time, favoring partially processed documents; failed PDFs have a six-hour backoff in manifest metadata.
* `supabase/migrations/20261018182916_nyxi_pdf_extraction_lease_v1.sql` reproduces the already-applied production lease table and restricted RPC.

## Production verification (18 October 2026)

- EU SCCS TPO 2014 (snapshot `cc500b8a-e7b2-4212-9387-bcd9d9f6aa48`): all 31 pages extracted, 82 pending-review fragments; immutable original archived and SHA checked.
- EU SCCS HEMA/di-HEMA 2018: 10 of 40 pages extracted in first successful execution, cursor 11; processing remains private.
- Snapshot and manifest status differ by design: the **snapshot** has the original `awaiting_pdf_parser` marker and is not mutated; the manifest and run provide current state.
- Document images, formula interpretation, dose/concentration and legal applicability are **not** inferred by this stage. Scientific analysis and human approvals are separate stages.

## Safety/release checklist

1. Review the exact source, SQL grants and Edge function deployment; do not remove the scheduler token, PDF signature/hash checks or least-privilege grants.
2. Verify `anon` and `authenticated` cannot read `nyxi_pdf_extraction_leases` or invoke `nyxi_pdf_claim_v1`.
3. Trigger `public.nyxi_run_acquisition_schedule()` and inspect the `net._http_response` record; verify actual PDF run cursor and unique fragment count, not just a successful cron status.
4. Concurrent manual triggers must return `lease_busy` for the second invocation without inserting duplicate fragments.
5. Verify all extracted fragments remain pending review, no `nyxi_fragment_publication_approvals` is implicitly created, and no Drive mirror is automatically enabled.

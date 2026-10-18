# NYXI production evidence acquisition worker (v9)

Production project: `eemihhfreggbigxejjhj` (NYXI's existing Supabase database).

This directory versions the exact deployed Edge Function `nyxi-acquisition-worker`. Its POST endpoint is invoked by `public.nyxi_run_acquisition_schedule()` under the existing pg_cron job (job id 80, currently `*/10 * * * *`). The worker verifies a private scheduler token against its stored hash before any reads or capture requests. Never copy secrets into this repository.

## Scope and safeguards

- The worker never acquires directly from the broad `nyxi_sources` registry; it reads **only** active exact-asset entries of `nyxi_asset_acquisition_approvals` and sends their IDs to the rights-enforcing `nyxi-evidence-collector`.
- Rights approval is asset- and URL-specific. The collector also requires an exact final URL, private original-byte archival, SHA-256, no redirects/link following and no image acquisition. Separate approval is required for PDFs, manufacturer pages/SDS, ECHA materials, mirroring to Google Drive and public publication.
- Enforce a 24-hour cooldown after an archived capture, one due URL per hostname in each run, a maximum of eight host requests, and a 24-hour retry backoff after non-crawl-delay errors. This prevents the initial three FDA sources from monopolizing the acquisition cycle.
- Drain at most four private pending HTML extraction runs per invocation. Parsed fragments remain **private and unreviewed**. An extraction run is not publication approval. The public knowledge index, regulatory graph and shade measurements are separate downstream pipelines.
- The separately deployed `nyxi-evidence-collector` and `nyxi-private-extractor` maintain their own gates. Do not weaken their authorization, provenance or parsing contracts.

## Production release and verification

1. Check code, source rights, secret references, callback auth, timeouts and pending acquisition approvals. Changes to permissions require a separate source-specific, auditable review.
2. Deploy only to `nyxi-acquisition-worker` with the existing `verify_jwt=false` mode **and** its mandatory custom scheduler-token verification. Avoid exposing an unauthenticated route.
3. Read back the deployed source/version, cron settings and database counts. Trigger `public.nyxi_run_acquisition_schedule()` once, then inspect the matching `net._http_response` for status and per-item errors; a successful pg_cron job alone does not prove capture succeeded.
4. Query distinct `source_id` in `nyxi_source_snapshots`; total snapshots include repeated versions of the same source and must **not** be reported as distinct acquired sources.
5. Do not repeatedly retry HTTP 403/429. Honor website policies and host-level delay; resolve parser-empty JS/SPA pages through explicit source-specific review rather than broader automatic crawling.

## Baseline audit (18 October 2026)

Before expanding the queue: 303 registry records, three distinct archived FDA sources, 85 snapshots, 742 extracted private fragments, three authorized assets. After first production expansion and worker deployment: 32 authorized exact public-government HTML assets, 21 distinct archived sources, 103 snapshots, 777 private fragments. More processing runs are scheduled. Zero Drive mirrors and zero public release approvals were granted.

These baseline counts are observations, not promises of ingesting all 303 sources. Broad manufacturer catalogues, SDS, ECHA registries, and linked images/documents remain outside this queue pending documented rights and technical checks.

## Failure diagnostics (production worker v11, 18 Oct 2026)

The worker now stores a short, redacted error detail alongside each unsuccessful acquisition in the internal approval metadata (`last_worker_error_detail`) and per-run response (`error_detail`). The detail is capped at 200 characters; bearer tokens and 64-character hexadecimal strings are redacted. Errors keep the same 24-hour backoff and never cause unauthorized retries or bypass a 403, redirect restriction, crawl delay or approval requirement. This is for diagnosing Australian upstream/collector failures without exposing private evidence or secret credentials.

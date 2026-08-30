# Open Icecat product-detail enrichment worker

## Purpose

The `icecat-detail` worker is the second stage of the Open Icecat ingestion pipeline.

1. `BLS_WORKER_ROLE=icecat` maintains the durable Open Icecat provider index.
2. `BLS_WORKER_ROLE=icecat-detail` fetches Greek product details for completed index evidence.
3. The detail worker writes only governed source evidence:
   - `catalog_source_snapshots`
   - `catalog_source_products`
   - `catalog_source_product_localizations`
   - `catalog_source_attribute_observations`

It does **not** create canonical products or variants, vendor assortment, vendor offers, prices, stock, checkout availability, search publication, or storefront visibility.

## Governance boundary

Open Icecat remains a data provider, not commerce truth. A successful detail job means only that provider evidence was captured.

The existing Greek-quality boundary from migration `0158_open_icecat_greek_product_intelligence.sql` remains authoritative:

- locale must be `EL`;
- Greek completeness must be at least 0.90;
- title, description, category and specifications must satisfy the quality gate;
- field provenance is retained;
- `ready` is still only source-level eligibility;
- canonical/public publication remains a separate governed workflow.

The first detail-worker release deliberately does not invent or automatically translate missing Greek content. Native Greek records that do not meet the boundary are persisted as `needs_enrichment` for later verified enrichment/review.

## Durable queue

Migration `0163_open_icecat_detail_enrichment.sql` creates `open_icecat_detail_enrichment_jobs`.

Jobs are keyed by `(source_id, product_id)` and are version-bound to:

- the latest bulk-index run;
- the provider `source_updated` marker when present;
- `OPEN_ICECAT_DETAIL_PROCESSING_VERSION`.

New/changed index rows are queued incrementally during bulk ingestion. Removed rows are skipped immediately. Existing index rows can be backfilled once through the repository sync performed at detail-worker startup.

Workers claim rows with `FOR UPDATE SKIP LOCKED`. Processing leases can be reclaimed after expiry. Before evidence is committed, the current index version is checked again; a product that changed or was removed during the API request is not committed as the stale version.

A completed **full** provider-index run also retires previously active index rows that were absent from that full snapshot. This is required for genuine full reconciliation and prevents stale Icecat rows from remaining active indefinitely.

## Credentials

The detail API requires both:

- `ICECAT_USERNAME` — the Icecat shop/account name;
- `ICECAT_API_TOKEN` — server-side API token.

`ICECAT_CONTENT_TOKEN` is optional when the account uses one.

These values are worker-only secrets. Do not expose them to the browser, Vercel client environment, logs, source control, health output, or Admin pages.

The client refuses HTTP redirects for authenticated detail requests so credentials cannot be forwarded to a redirect target.

## Required environment

```text
NODE_ENV=production
DATABASE_URL=postgresql://...
BLS_WORKER_ROLE=icecat-detail
ICECAT_USERNAME=...
ICECAT_API_TOKEN=...
ICECAT_CONTENT_TOKEN=
```

Recommended defaults:

```text
BLS_OPEN_ICECAT_DETAIL_POLL_MS=2000
BLS_OPEN_ICECAT_DETAIL_BATCH_SIZE=5
BLS_OPEN_ICECAT_DETAIL_LEASE_SECONDS=300
BLS_OPEN_ICECAT_DETAIL_REQUEST_TIMEOUT_MS=15000
BLS_OPEN_ICECAT_DETAIL_RATE_DELAY_MS=750
BLS_OPEN_ICECAT_DETAIL_MAX_ATTEMPTS=5
BLS_OPEN_ICECAT_DETAIL_RETRY_BASE_SECONDS=60
BLS_OPEN_ICECAT_DETAIL_HEALTH_PORT=8083
BLS_OPEN_ICECAT_DETAIL_RUN_ONCE=false
BLS_OPEN_ICECAT_MIN_GREEK_SCORE=0.9
```

The worker refuses to start when the configured lease is too short for the worst-case batch request/rate-delay budget.

## Runtime behavior

For every claimed item the worker:

1. selects a checksum-valid GTIN from provider index evidence;
2. requests the Icecat `EL` product detail;
3. normalizes identifiers, brand/MPN, Greek text, specifications, images and variants;
4. stores the sanitized raw payload and normalized source evidence;
5. stores EL field-level provenance and Greek completeness;
6. stores specifications as unmapped source attributes for the normal attribute-governance workflow;
7. marks the job `ready` or `needs_enrichment`.

Source image URLs are evidence only. The existing source policy requires self-hosting before public use; this worker does not bypass the media pipeline or render external Icecat assets publicly.

Transient failures use exponential retry. After the configured maximum attempts, the job becomes `failed`. A worker shutdown aborts the active Icecat request; the processing lease then expires naturally so another worker can reclaim the job safely.

## Health

The worker exposes `/healthz` on `BLS_OPEN_ICECAT_DETAIL_HEALTH_PORT` and reports:

- worker/source identity;
- current product and GTIN;
- schema and processing version;
- last activity/queue-sync time;
- active provider-index count;
- unqueueable rows without GTIN;
- pending, processing, retry, ready, needs-enrichment, failed and skipped queue counts.

Credentials and raw Icecat payloads are never emitted in health output.

## Deployment

Deploy this as a continuously running isolated Node 24 worker service using the normal worker image and:

```text
BLS_WORKER_ROLE=icecat-detail
```

Do not run it as a Vercel request/response function. Keep the health port private to the worker platform's health probe.

The bulk-index worker and detail worker are separate by design: large index downloads have one concurrency/restart profile, while rate-limited per-product API enrichment has another.

## Publication invariant

The invariant for this worker is:

> Open Icecat detail enrichment may improve source evidence, but it can never make a product sellable or public by itself.

Any future automatic localization, canonical matching or product promotion must preserve that boundary and pass the existing Greek-quality, source-mapping, catalogue and commerce activation rules explicitly.

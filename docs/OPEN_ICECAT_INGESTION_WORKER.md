# Open Icecat ingestion worker

## Purpose

The Open Icecat worker maintains a durable, resumable copy of the provider's Greek (`EL`) product index in `public.open_icecat_index_products`.

This is **provider-index staging only**. A staged row is not a canonical product, vendor offer, price, stock record, or publication approval. Product detail still has to enter the governed source-product pipeline and pass the existing Greek-quality boundary before it can contribute to public catalogue content.

## Deployment role

Deploy the normal worker image as a continuously running isolated service with:

```text
BLS_WORKER_ROLE=icecat
```

The worker is intentionally separate from the short-job scheduler. A full Open Icecat index can run for much longer than the scheduler's ordinary lease window.

The container exposes `/healthz` on `BLS_OPEN_ICECAT_HEALTH_PORT` (default `8082`). Keep that port private to the platform health probe.

## Source lifecycle

The source configuration comes from the active Sparta `catalog_sources.code='open_icecat'` row introduced by migration `0158`.

The worker:

1. performs a full Greek index import until one completes under the current `OPEN_ICECAT_BULK_PROCESSING_VERSION`;
2. switches to the Greek daily index afterward;
3. includes daily `REMOVED` rows so provider removals are staged explicitly;
4. uses a response `ETag`, or `Last-Modified` plus content length as a fallback, as the immutable run fingerprint;
5. resumes only when source URL, fingerprint, import kind and processing version match;
6. falls back to a new full reconciliation if a failed daily snapshot is no longer the snapshot currently served by Icecat.

The worker does not discard off-market, country-market or unapproved-GTIN rows during index staging. Those attributes are retained as provider evidence so downstream policy can make the eligibility decision without leaving stale index state behind.

## Concurrency and restart safety

Only one Open Icecat ingestion process may run at a time. The worker holds a PostgreSQL session advisory lock named `buy-local-sparta:open-icecat-index-ingestion` for the entire cycle.

Within a run, migration `0160` supplies the durable source-row checkpoint. Every terminal source row advances the cursor, including rejected and filtered rows. Index writes/removals and the checkpoint commit in the same database transaction. If a batch fails, that source-row range is replayed after restart.

The parser also fails closed on malformed UTF-8, oversized records and source-row gaps.

## Credentials

Prefer an Open Icecat API token:

```text
ICECAT_API_TOKEN=...
```

The worker also accepts Basic authentication as a compatibility fallback when both values are present:

```text
ICECAT_USERNAME=...
ICECAT_PASSWORD=...
```

Never commit credentials. Inject them only into the isolated worker service.

The source URL is constrained to HTTPS on `data.icecat.biz`, must end in `.index.csv.gz`, and may not contain embedded credentials, query parameters or fragments.

## Runtime configuration

Recommended defaults are documented in `deploy/worker.env.example`:

```text
BLS_OPEN_ICECAT_INTERVAL_MS=86400000
BLS_OPEN_ICECAT_RETRY_MS=3600000
BLS_OPEN_ICECAT_LOCK_RETRY_MS=60000
BLS_OPEN_ICECAT_FETCH_TIMEOUT_MS=7200000
BLS_OPEN_ICECAT_BATCH_SIZE=500
BLS_OPEN_ICECAT_MAX_RECORD_CHARS=8388608
BLS_OPEN_ICECAT_HEALTH_PORT=8082
BLS_OPEN_ICECAT_RUN_ONCE=false
```

`BLS_OPEN_ICECAT_RUN_ONCE=true` is useful for an operator-controlled one-shot execution. It exits with an error if another ingestion worker already owns the advisory lock.

## Observability

Recent run state is visible in Admin under `/admin/catalogue-intake/import` and includes:

- full vs daily run;
- durable source-row checkpoint;
- staged and removed index rows;
- rejected and filtered counts;
- current active/removed index counts;
- source fingerprint and processing version;
- failure details and timestamps.

Worker logs use structured JSON events and never include Icecat credentials.

## Publication boundary

A completed Open Icecat index run means only that provider index staging succeeded. The worker must never write directly to canonical products, vendor assortment, offers, inventory, pricing or storefront publication state. Greek product content remains governed by the localization/provenance rules introduced in migration `0158` and the existing source-to-canonical promotion workflow.

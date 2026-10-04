# Deployment environment matrix

This document prevents provider credentials from being copied into every process by default.

## Vercel web

Required core values:

- `NODE_ENV=production`
- `DATABASE_URL` (or the connected `POSTGRES_URL` alias normalized by the web runtime)
- `BLS_AUTH_SECRET`
- `APP_URL` / public deployment origin

Provider values required **only when the matching web feature is enabled**:

- Viva checkout/webhooks: `VIVA_*`
- AADE Admin transport: `AADE_MYDATA_*` and approved mapping flags
- customer search: `MEILISEARCH_URL`, `MEILISEARCH_INDEX_UID`, `MEILISEARCH_SEARCH_KEY`
- Resend webhook + notification configuration: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `BLS_NOTIFICATION_SUPPRESSION_SECRET`
- media upload signing/completion: object-storage bucket/region/credentials + `BLS_MEDIA_UPLOAD_ORIGIN`
- BOX NOW checkout/shipping/webhook: `BOXNOW_*` plus public widget variables
- reporting: no new third-party credential is required. Keep `BLS_REPORT_ASYNC_ENABLED=false` unless a healthy `reports` worker is deployed.


**Do not put `BLS_CLAMAV_HOST` on Vercel merely to satisfy web readiness.** Production ClamAV is bundled into `deploy/media-worker.Dockerfile` and binds to loopback inside that worker container. The web readiness endpoint checks private object storage only; ClamAV readiness belongs to the worker startup gate.

The web process needs only the Meilisearch **search key** for customer queries. `MEILISEARCH_ADMIN_KEY` belongs on the search worker/configuration job, not on Vercel unless an explicit Admin indexing operation truly requires it.

## `postgres` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=postgres`

It owns durable scheduled leases, reservation/pending-payment cleanup, Viva uncertainty watchdogs and retention jobs.

## `crawler` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=crawler`

Recommended runtime controls:

- `BLS_CRAWLER_WORKER_ID=<stable worker identity>`
- `BLS_CRAWLER_POLL_MS=2000`
- `BLS_CRAWLER_LEASE_SECONDS=300`
- `BLS_CRAWLER_REQUEST_TIMEOUT_MS=15000`
- `BLS_CRAWLER_MAX_ATTEMPTS=5`
- `BLS_CRAWLER_HEALTH_PORT=8081`

The crawler is an isolated long-running source-evidence worker. Its health port should be reachable only by the container platform's health probe.


## `nyxi-sources` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=nyxi-sources`
- private object-storage bucket/region/credentials

Recommended runtime controls:

- `BLS_NYXI_SOURCE_WORKER_ID=<stable worker identity>`
- `BLS_NYXI_SOURCE_POLL_MS=15000`
- `BLS_NYXI_SOURCE_LEASE_SECONDS=300`
- `BLS_NYXI_SOURCE_REQUEST_TIMEOUT_MS=30000`
- `BLS_NYXI_SOURCE_MAX_RESPONSE_BYTES=26214400`
- `BLS_NYXI_SOURCE_MAX_REDIRECTS=5`
- `BLS_NYXI_SOURCE_DISCOVERY_MAX_LINKS=2000`
- `BLS_NYXI_SOURCE_DISCOVERY_MAX_BYTES=8388608`

The worker writes source-check state, append-only retrieval evidence, immutable snapshot metadata, structurally discovered source candidates and raw source bytes under the private `private/nyxi/source-archive/` prefix. It performs no ingredient extraction, formula classification or public serving.

Production collection can run without a permanent service through `.github/workflows/nyxi-source-collector.yml` every six hours. Prefer dedicated `NYXI_DATABASE_URL`, `NYXI_OBJECT_STORAGE_ACCESS_KEY_ID` and `NYXI_OBJECT_STORAGE_SECRET_ACCESS_KEY` repository secrets. The workflow supports fallback to the existing scoped MEDIA database/object-storage secrets when the same private storage permissions are intentionally shared.

## `symphonya` worker

Required for catalogue/stock operation:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=symphonya`
- `BLS_SYMPHONYA_WORKER_ENABLED=true`
- `SYMPHONYA_API_KEY`

Recommended safe rollout:

- `SYMPHONYA_ENABLED=false` until the controlled supplier-order smoke test succeeds
- `BLS_SYMPHONYA_CATALOGUE_ENABLED=true`
- `BLS_SYMPHONYA_STOCK_ENABLED=true`
- `BLS_SYMPHONYA_MATERIALIZATION_ENABLED=true`
- `BLS_SYMPHONYA_AUTO_PRICING_ENABLED=true`
- `BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED=true` only when storefront visibility is intended
- `BLS_SYMPHONYA_MATERIALIZATION_CATCHUP_PASSES=4`
- `BLS_SYMPHONYA_PRICING_CATCHUP_PASSES=4`
- `BLS_SYMPHONYA_STOCK_INTERVAL_MS=300000`

Optional automatic Greek copy generation:

- `BLS_CATALOGUE_AI_ENRICHMENT_ENABLED=true`
- `BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL=true`
- `OPENAI_API_KEY`
- `BLS_CATALOGUE_AI_ENRICHMENT_BATCH_SIZE=2` (raise gradually after observing throughput/cost)

The worker can synchronize, materialize, price, localize, refresh stock and publish without supplier-order forwarding. Customer payment for Symphonya remains blocked until both `SYMPHONYA_ENABLED=true` and the production `dropship_suppliers.order_forwarding_enabled` flag are true. Do not enable those order-mutation gates merely to accelerate catalogue visibility.

## `search` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=search`
- `BLS_SEARCH_ENABLED=true`
- `MEILISEARCH_URL`
- `MEILISEARCH_INDEX_UID`
- `MEILISEARCH_SEARCH_KEY`
- `MEILISEARCH_ADMIN_KEY`

The admin key is intentionally isolated here because this process creates/configures and updates the index.

## `notifications` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=notifications`
- `BLS_EMAIL_DELIVERY_ENABLED=true`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `BLS_NOTIFICATION_SUPPRESSION_SECRET`

## `media` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=media`
- `BLS_MEDIA_PIPELINE_ENABLED=true`
- object-storage credentials/configuration
- `BLS_CLAMAV_HOST=127.0.0.1`
- `BLS_CLAMAV_PORT=3310`

Production media scanning is scheduled by `.github/workflows/media-worker-production.yml` every five minutes. The workflow pulls the image built from `deploy/media-worker.Dockerfile`, starts its loopback-only `clamd`, runs the queue worker in bounded `drain` mode, and exits. No Railway service, separate ClamAV service, or public scanner endpoint is required. Configure the GitHub repository secrets `MEDIA_DATABASE_URL`, `MEDIA_OBJECT_STORAGE_ACCESS_KEY_ID`, and `MEDIA_OBJECT_STORAGE_SECRET_ACCESS_KEY` before activation.

## `reports` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=reports`

Recommended runtime controls:

- `BLS_REPORT_POLL_MS=5000`
- `BLS_REPORT_BATCH_SIZE=2`
- `BLS_REPORT_WORKER_ID=<stable worker identity>`

Enable queue delegation on the Vercel web process with `BLS_REPORT_ASYNC_ENABLED=true` only after this worker is healthy. The report worker does not need Resend credentials: report email delivery is initiated by an authenticated web action using the existing transactional email integration. It also does not need Meilisearch admin credentials or ClamAV access.

Generated report PDFs and datasets are persisted in private PostgreSQL report-job records with retention controls; they are not public object-storage assets and are not exposed through the Supabase Data API.

## Secret-sharing rule

Give each process only the credentials it uses. Shared secrets should be stable across instances that validate the same signed state, but provider admin/indexing/scanner/content credentials must not be copied into unrelated web processes for convenience.

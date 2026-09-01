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

**Do not put Icecat provider credentials on Vercel for Admin catalogue observability.** `/admin/catalogue` reads redacted source/queue state from PostgreSQL and never needs `ICECAT_API_TOKEN`, `ICECAT_USERNAME`, `ICECAT_PASSWORD` or `ICECAT_CONTENT_TOKEN`.

**Do not put `BLS_CLAMAV_HOST` on Vercel merely to satisfy web readiness.** ClamAV is a private media-worker dependency. The web readiness endpoint checks that private object storage is usable; the staging preflight checks ClamAV independently from a runner that can reach the scanner.

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

## `icecat` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=icecat`
- `ICECAT_API_TOKEN` (preferred)

Compatibility fallback only when needed by the provider account:

- `ICECAT_USERNAME`
- `ICECAT_PASSWORD`

Recommended runtime controls:

- `BLS_OPEN_ICECAT_WORKER_ID=<stable worker identity>`
- `BLS_OPEN_ICECAT_INTERVAL_MS=86400000`
- `BLS_OPEN_ICECAT_RETRY_MS=3600000`
- `BLS_OPEN_ICECAT_LOCK_RETRY_MS=60000`
- `BLS_OPEN_ICECAT_FETCH_TIMEOUT_MS=7200000`
- `BLS_OPEN_ICECAT_BATCH_SIZE=500`
- `BLS_OPEN_ICECAT_MAX_RECORD_CHARS=8388608`
- `BLS_OPEN_ICECAT_HEALTH_PORT=8082`
- `BLS_OPEN_ICECAT_RUN_ONCE=false`

This role performs the EL bulk-index bootstrap/daily synchronization. Keep its API/basic credentials server-side on this worker only. Its health endpoint must not expose credentials or raw provider payloads.

## `icecat-detail` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=icecat-detail`
- `ICECAT_USERNAME`
- `ICECAT_API_TOKEN`
- `ICECAT_CONTENT_TOKEN`

Recommended runtime controls:

- `BLS_OPEN_ICECAT_DETAIL_WORKER_ID=<stable worker identity>`
- `BLS_OPEN_ICECAT_DETAIL_POLL_MS=2000`
- `BLS_OPEN_ICECAT_DETAIL_SYNC_INTERVAL_MS=300000`
- `BLS_OPEN_ICECAT_DETAIL_BATCH_SIZE=5`
- `BLS_OPEN_ICECAT_DETAIL_LEASE_SECONDS=300`
- `BLS_OPEN_ICECAT_DETAIL_REQUEST_TIMEOUT_MS=15000`
- `BLS_OPEN_ICECAT_DETAIL_RATE_DELAY_MS=750`
- `BLS_OPEN_ICECAT_DETAIL_MAX_ATTEMPTS=5`
- `BLS_OPEN_ICECAT_DETAIL_RETRY_BASE_SECONDS=60`
- `BLS_OPEN_ICECAT_DETAIL_HEALTH_PORT=8083`
- `BLS_OPEN_ICECAT_DETAIL_RUN_ONCE=false`
- `BLS_OPEN_ICECAT_MIN_GREEK_SCORE=0.9`

This role consumes completed index evidence and writes governed source-product, EL localization and unmapped-attribute evidence. It does **not** create canonical products, offers, prices or stock. The content token belongs only here unless another separately reviewed server-side process explicitly needs it.

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
- `BLS_CLAMAV_HOST`
- `BLS_CLAMAV_PORT`

This worker should run on a network that can reach private `clamd`. Do not make the scanner publicly reachable for Vercel.

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

Give each process only the credentials it uses. Shared secrets should be stable across instances that validate the same signed state, but provider admin/indexing/scanner/content credentials must not be copied into unrelated web processes for convenience. In particular, keep Icecat API/content tokens on the isolated Icecat workers; Admin observability needs database access only.

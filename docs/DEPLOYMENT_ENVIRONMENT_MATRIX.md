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

**Do not put `BLS_CLAMAV_HOST` on Vercel merely to satisfy web readiness.** ClamAV is a private media-worker dependency. The web readiness endpoint checks that private object storage is usable; the staging preflight checks ClamAV independently from a runner that can reach the scanner.

The web process needs only the Meilisearch **search key** for customer queries. `MEILISEARCH_ADMIN_KEY` belongs on the search worker/configuration job, not on Vercel unless an explicit Admin indexing operation truly requires it.

## `postgres` worker

Required:

- `DATABASE_URL`
- `BLS_WORKER_ROLE=postgres`

It owns durable scheduled leases, reservation/pending-payment cleanup, Viva uncertainty watchdogs and retention jobs.

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

Give each process only the credentials it uses. Shared secrets should be stable across instances that validate the same signed state, but provider admin/indexing/scanner credentials must not be copied into unrelated web processes for convenience.

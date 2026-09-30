# KONTA MOY — Private Media Storage & Malware Scanning Runbook

This document describes the governed media security model. For the exact production project, endpoint, activation order and deployment values, use `docs/operations/media-production.md`.

## Production model

Vendor and Admin media is uploaded directly from the browser to a **private S3-compatible bucket** with a short-lived presigned `PUT`. KONTA MOY never makes the staging object public. The browser then calls the completion API; the server HEAD-checks object size and content type against the signed upload intent before creating the governed media record in `pending` scan state.

A scheduled GitHub Actions media scanner owns malware scanning. Each bounded run starts the production container defined by `deploy/media-worker.Dockerfile`; that container includes its own loopback-only `clamd` process, so production does **not** need Railway or a second ClamAV network service. The worker streams the exact private object through the ClamAV `INSTREAM` protocol while computing the authoritative SHA-256, drains a bounded queue slice, and exits.

Only a clean automated scan may move `scan_status` to `clean`. Rights and moderation remain separate Admin decisions. Public governed media requires all three states: `scan_status=clean`, `rights_status=approved`, and `moderation_status=approved`.

## Current production storage contract

The production target is Supabase Storage S3 compatibility:

- bucket: `buy-local-sparta-private`
- public access: disabled
- region: `us-east-1`
- endpoint: `https://eemihhfreggbigxejjhj.storage.supabase.co/storage/v1/s3`
- browser upload origin: `https://eemihhfreggbigxejjhj.storage.supabase.co`
- path-style S3 requests: enabled
- maximum object size: 25 MiB (`26214400` bytes)
- currently allowed production MIME types: JPEG, PNG, WebP and PDF

Do not document video as production-supported until the bucket MIME policy and the upload/product UI are deliberately expanded and verified end to end.

## Required web environment

The Vercel web runtime needs object-storage configuration only when governed uploads are enabled:

- `BLS_MEDIA_PIPELINE_ENABLED=true`
- `BLS_OBJECT_STORAGE_BUCKET`
- `BLS_OBJECT_STORAGE_REGION`
- `BLS_OBJECT_STORAGE_ENDPOINT`
- `BLS_OBJECT_STORAGE_FORCE_PATH_STYLE=true`
- `BLS_OBJECT_STORAGE_ACCESS_KEY_ID`
- `BLS_OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `BLS_MEDIA_UPLOAD_ORIGIN`
- `BLS_MEDIA_UPLOAD_MAX_BYTES`
- `BLS_MEDIA_UPLOAD_TTL_SECONDS`

Generate the Supabase S3 server credentials under **Storage → Configuration → S3**. Keep them server-side and secret-managed. Never expose them through `NEXT_PUBLIC_*`.

Do not enable `BLS_MEDIA_PIPELINE_ENABLED` on Vercel until a healthy media worker is running against the same production database and bucket.

## Browser/CSP controls

Browser uploads require bucket CORS for the exact KONTA MOY application origin, method `PUT`, and the `Content-Type` request header. Keep the CORS origin exact rather than `*`.

`BLS_MEDIA_UPLOAD_ORIGIN` is also added to the web CSP `connect-src`. The upload service rejects a signed URL whose origin does not exactly match this configured value.

## GitHub Actions media scanner and ClamAV controls

Production scanning runs from `.github/workflows/media-worker-production.yml` every five minutes, with manual dispatch available for activation tests. The workflow pulls the image published by `.github/workflows/media-worker-image.yml` and runs it in bounded drain mode.

The container image:

1. refreshes ClamAV signatures when possible;
2. starts `clamd` on `127.0.0.1:3310`;
3. waits for a successful ClamAV `PING`;
4. drops the marketplace worker process to the unprivileged `node` user;
5. starts `workers/media-worker.ts`;
6. drains at most the configured queue slice and exits.

GitHub Actions repository secrets:

- `MEDIA_DATABASE_URL`
- `MEDIA_OBJECT_STORAGE_ACCESS_KEY_ID`
- `MEDIA_OBJECT_STORAGE_SECRET_ACCESS_KEY`

Runtime controls supplied by the workflow:

- `BLS_WORKER_ROLE=media`
- `BLS_MEDIA_PIPELINE_ENABLED=true`
- `BLS_MEDIA_WORKER_MODE=drain`
- `BLS_MEDIA_WORKER_MAX_ITEMS=50`
- `BLS_MEDIA_WORKER_MAX_RUNTIME_MS=210000`
- the production Supabase S3 bucket/endpoint configuration
- `BLS_CLAMAV_HOST=127.0.0.1`
- `BLS_CLAMAV_PORT=3310`

Port 3310 remains internal to the container. The ClamAV TCP protocol has no authentication or encryption and must never be published.

## Worker lifecycle

For each cycle the worker:

1. expires unfinished upload intents and deletes their private staging objects;
2. claims scan work with PostgreSQL `FOR UPDATE SKIP LOCKED` leases;
3. reads one staging-object ETag and streams that exact object through ClamAV and SHA-256;
4. rejects changed-size objects;
5. conditionally copies a clean object to an immutable verified key only if the staging ETag still matches;
6. stores the verified key and clean hash, then deletes staging;
7. deletes malware-detected objects;
8. retries transient failures with bounded exponential backoff.

After five failed scan attempts an asset remains private in `failed` state for operational review; it is never auto-published.

## Admin governance

Production Admin cannot manually record `scan_clean` or `scan_infected`. Automated malware processing owns scan state. Admin may approve or reject **rights and moderation only after a clean scan**. Compliance documents linked to media remain unverifiable until scan, rights and moderation all pass.

## End-to-end activation proof

Before broad activation, prove in this order:

1. the private bucket and server-side S3 credentials are reachable from the GitHub Actions scanner;
2. a manual `Production Media Scanner` run reaches PostgreSQL and logs both `media_worker.started` and `media_worker.stopped` without readiness errors;
3. Vercel receives the production storage variables and `BLS_MEDIA_PIPELINE_ENABLED=true`;
4. `/api/health/ready` reports the media dependency ready;
5. a controlled JPEG receives a presigned PUT and completes successfully;
6. its governed record advances `pending → clean`;
7. Admin rights and moderation approval succeeds;
8. publication makes the asset visible on the intended storefront surface;
9. the staging object is no longer left behind.

Keep uploads fail-closed if any one of these stages is unavailable.

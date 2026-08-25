# Production media pipeline — KONTA MOU

This runbook is intentionally fail-closed. Product/storefront uploads must remain gated until private storage and the malware-scanning worker are both operational.

## Provisioned production storage

Supabase project: `eemihhfreggbigxejjhj`

Private bucket: `buy-local-sparta-private`

Current bucket policy/configuration:

- public access: disabled
- maximum object size: 25 MiB (`26214400` bytes)
- allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`

Supabase S3 endpoint:

`https://eemihhfreggbigxejjhj.storage.supabase.co/storage/v1/s3`

Upload origin used by the browser CSP:

`https://eemihhfreggbigxejjhj.storage.supabase.co`

Region: `us-east-1`

Supabase Storage requires path-style S3 requests for this integration.

## One-time secret creation

In Supabase Dashboard open **Storage → Configuration → S3** and generate a server-side S3 access key pair. The secret is displayed once. Do not put either credential in source control, support tickets, logs, or client-side code.

The generated pair is needed by both the Vercel web runtime and the isolated media worker:

- `BLS_OBJECT_STORAGE_ACCESS_KEY_ID`
- `BLS_OBJECT_STORAGE_SECRET_ACCESS_KEY`

## Vercel production environment

Set these only for the Production environment of `buylocalsparta-web`:

```text
BLS_MEDIA_PIPELINE_ENABLED=true
BLS_OBJECT_STORAGE_BUCKET=buy-local-sparta-private
BLS_OBJECT_STORAGE_REGION=us-east-1
BLS_OBJECT_STORAGE_ENDPOINT=https://eemihhfreggbigxejjhj.storage.supabase.co/storage/v1/s3
BLS_OBJECT_STORAGE_FORCE_PATH_STYLE=true
BLS_OBJECT_STORAGE_ACCESS_KEY_ID=<secret>
BLS_OBJECT_STORAGE_SECRET_ACCESS_KEY=<secret>
BLS_MEDIA_UPLOAD_ORIGIN=https://eemihhfreggbigxejjhj.storage.supabase.co
BLS_MEDIA_UPLOAD_MAX_BYTES=26214400
BLS_MEDIA_UPLOAD_TTL_SECONDS=600
```

Do not enable the web flag until the worker below has successfully started against the same database and storage bucket.

## Media worker

The production image is built from `deploy/media-worker.Dockerfile`. It contains a loopback-only ClamAV daemon and the KONTA MOU queue worker. The ClamAV TCP port is never meant to be exposed publicly.

After merge to `main`, GitHub Actions publishes:

```text
ghcr.io/pcrus1988-bit/buylocalsparta-media-worker:latest
```

Deploy exactly one instance initially on an always-on container platform. Use at least 2 GiB RAM; 4 GiB is preferred because ClamAV signature loading can be memory intensive.

Worker environment:

```text
NODE_ENV=production
BLS_WORKER_ROLE=media
DATABASE_URL=<production PostgreSQL runtime URL>
BLS_DB_APPLICATION_NAME=buy-local-sparta-media-worker
BLS_MEDIA_PIPELINE_ENABLED=true
BLS_OBJECT_STORAGE_BUCKET=buy-local-sparta-private
BLS_OBJECT_STORAGE_REGION=us-east-1
BLS_OBJECT_STORAGE_ENDPOINT=https://eemihhfreggbigxejjhj.storage.supabase.co/storage/v1/s3
BLS_OBJECT_STORAGE_FORCE_PATH_STYLE=true
BLS_OBJECT_STORAGE_ACCESS_KEY_ID=<same server-side S3 key>
BLS_OBJECT_STORAGE_SECRET_ACCESS_KEY=<same server-side S3 secret>
BLS_MEDIA_UPLOAD_MAX_BYTES=26214400
BLS_CLAMAV_HOST=127.0.0.1
BLS_CLAMAV_PORT=3310
BLS_CLAMAV_TIMEOUT_MS=30000
BLS_MEDIA_WORKER_POLL_MS=5000
BLS_MEDIA_WORKER_ID=media-prod-1
```

The container fails startup if database schema readiness, object-storage readiness, or the ClamAV PING check fails. This is deliberate.

Expected startup log:

```text
{"level":"info","event":"media_worker.started",...}
```

## Activation order

1. Keep `BLS_MEDIA_PIPELINE_ENABLED=false` in Vercel while provisioning.
2. Generate the Supabase S3 server credentials.
3. Deploy the media-worker container with ClamAV and confirm `media_worker.started`.
4. Confirm the worker can reach the production database and `buy-local-sparta-private` bucket.
5. Add the Vercel production storage variables.
6. Set `BLS_MEDIA_PIPELINE_ENABLED=true` in Vercel and redeploy.
7. Verify `/api/health/ready` reports the media dependency ready.
8. Upload a controlled JPEG through Admin Quick Add and confirm the asset progresses from `pending` to `clean` before using customer/vendor uploads broadly.

## Security invariants

- Browser uploads use short-lived S3 presigned PUT URLs.
- The target bucket is private.
- Upload completion verifies the stored byte size and MIME type against the signed intent.
- Uploaded objects are not treated as verified media until the isolated worker streams the exact object through ClamAV and computes SHA-256.
- Infected objects are deleted and marked rejected.
- Clean objects are copied to an immutable verified-media key before the staging object is deleted.
- Media rights/moderation state remains separate from malware status; a clean scan alone does not grant publication rights.

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

## GitHub Actions media scanner

Production malware scanning now runs in GitHub Actions instead of Railway or another always-on container platform.

The image remains built from `deploy/media-worker.Dockerfile` and published by `.github/workflows/media-worker-image.yml` as:

`ghcr.io/pcrus1988-bit/buylocalsparta-media-worker:latest`

The production scanner workflow is `.github/workflows/media-worker-production.yml`. It runs every five minutes and can also be started manually. Each invocation starts the image, starts loopback-only ClamAV, drains a bounded amount of scan work, and exits cleanly. Database leases make repeated and overlapping queue attempts safe; workflow-level concurrency prevents two production scanner jobs from running at the same time.

The scanner uses these bounded controls:

```text
BLS_MEDIA_WORKER_MODE=drain
BLS_MEDIA_WORKER_MAX_ITEMS=50
BLS_MEDIA_WORKER_MAX_RUNTIME_MS=210000
BLS_MEDIA_WORKER_POLL_MS=1000
```

Create these GitHub Actions repository secrets before activation:

```text
MEDIA_DATABASE_URL=<production PostgreSQL runtime URL>
MEDIA_OBJECT_STORAGE_ACCESS_KEY_ID=<Supabase S3 server access key>
MEDIA_OBJECT_STORAGE_SECRET_ACCESS_KEY=<Supabase S3 server secret>
```

Until all three secrets exist, the scheduled workflow exits successfully without scanning and prints an activation notice. This avoids a noisy five-minute failure loop during secret setup.

The workflow supplies the non-secret production storage topology itself:

- bucket `buy-local-sparta-private`
- region `us-east-1`
- endpoint `https://eemihhfreggbigxejjhj.storage.supabase.co/storage/v1/s3`
- path-style S3 enabled
- 25 MiB media ceiling
- loopback ClamAV on `127.0.0.1:3310`

Expected logs include `media_worker.started` followed by `media_worker.stopped`. A run with no pending media is healthy and exits with `processed: 0`.

## Activation order

1. Keep `BLS_MEDIA_PIPELINE_ENABLED=false` in Vercel while provisioning.
2. Generate the Supabase S3 server credentials.
3. Add `MEDIA_DATABASE_URL`, `MEDIA_OBJECT_STORAGE_ACCESS_KEY_ID`, and `MEDIA_OBJECT_STORAGE_SECRET_ACCESS_KEY` as GitHub Actions repository secrets.
4. Manually run `Production Media Scanner` once and confirm `media_worker.started` and `media_worker.stopped` with no readiness error.
5. Add the Vercel production storage variables using the same Supabase S3 credentials.
6. Set `BLS_MEDIA_PIPELINE_ENABLED=true` in Vercel and redeploy.
7. Verify `/api/health/ready` reports the media dependency ready.
8. Upload a controlled JPEG through Admin Quick Add and confirm a scheduled or manual scanner run advances the asset from `pending` to `clean` before using customer/vendor uploads broadly.

## Security invariants

- Browser uploads use short-lived S3 presigned PUT URLs.
- The target bucket is private.
- Upload completion verifies the stored byte size and MIME type against the signed intent.
- Uploaded objects are not treated as verified media until the isolated worker streams the exact object through ClamAV and computes SHA-256.
- Infected objects are deleted and marked rejected.
- Clean objects are copied to an immutable verified-media key before the staging object is deleted.
- Media rights/moderation state remains separate from malware status; a clean scan alone does not grant publication rights.

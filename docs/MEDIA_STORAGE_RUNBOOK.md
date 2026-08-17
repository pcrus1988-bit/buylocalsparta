# Buy Local Sparta — Private Media Storage & Malware Scanning Runbook

## Production model

Vendor media is uploaded directly from the browser to a **private S3-compatible bucket** with a short-lived presigned `PUT`. Buy Local Sparta never makes the object public at upload time. The browser then calls the completion API; the server HEAD-checks object size and content type against the signed upload intent before creating the `product_media` record in `pending` scan state.

A separate media worker streams the private object through `clamd` using the ClamAV `INSTREAM` protocol while computing the authoritative SHA-256. Only a clean automated scan may move `scan_status` to `clean`. Rights and moderation remain separate Admin decisions. Public media requires all three states: `scan_status=clean`, `rights_status=approved`, `moderation_status=approved`.

## Required environment

- `BLS_MEDIA_PIPELINE_ENABLED=true`
- `BLS_OBJECT_STORAGE_BUCKET`
- `BLS_OBJECT_STORAGE_REGION`
- `BLS_MEDIA_UPLOAD_ORIGIN` — exact origin of the generated browser upload URLs. This origin is added to CSP `connect-src`.
- `BLS_CLAMAV_HOST` and `BLS_CLAMAV_PORT`
- optional S3-compatible endpoint/path-style configuration
- preferably workload/IAM credentials. Static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are supported but should be secret-managed.

`BLS_MEDIA_MAX_BYTES` defaults to 25 MiB. Supported first-release media types are JPEG/PNG/WebP images, MP4/WebM video and PDF documents.

## Bucket controls

The bucket must remain private. Do not enable public-read ACLs or anonymous bucket policy. The web role needs only the object actions required to sign/verify private uploads; the media-worker role additionally needs read/delete. Use a dedicated prefix such as `private/vendor-media/` and lifecycle rules for abandoned objects as defense in depth.

Browser uploads require bucket CORS for the **Buy Local Sparta application origin**, `PUT`, and the `Content-Type` request header. Keep the CORS origin exact rather than `*`.

## ClamAV controls

`clamd` must be reachable only on a private/trusted network. Its TCP protocol has no authentication or encryption. Do not publish port 3310 to the internet. Configure `StreamMaxLength` at or above `BLS_MEDIA_MAX_BYTES`, keep signature databases updated, and alert when the scanner becomes unavailable or signatures are stale.

## Worker

Run:

```bash
npm run worker:media
```

The worker:

1. expires unfinished upload intents and deletes their private objects;
2. claims scan work with PostgreSQL `FOR UPDATE SKIP LOCKED` leases;
3. reads one staging-object ETag and streams that exact object through ClamAV and SHA-256;
4. rejects changed-size objects;
5. conditionally copies a clean object to an immutable verified key only if the staging ETag still matches, closing presigned-URL overwrite races;
6. stores the verified key and clean hash, then deletes staging;
7. deletes malware-detected objects;
8. retries transient failures with bounded exponential backoff.

After five failed scan attempts the asset remains private in `failed` state for operational review; it is never auto-published.

## Admin governance

Production Admin cannot manually record `scan_clean` or `scan_infected`. Automated malware processing owns scan state. Admin may approve/reject **rights and moderation only after a clean scan**. Compliance documents linked to media remain unverifiable until scan, rights and moderation all pass.

## Deployment proof

Production CI proves the PostgreSQL upload-intent/finalization/scan-state lifecycle across independent application runtimes. A real S3/ClamAV environment must additionally prove: presigned browser PUT, CORS, HEAD verification, clean EICAR-safe test handling in an isolated non-production bucket, infected-object deletion/quarantine behavior, worker restart/lease recovery, and alerting.

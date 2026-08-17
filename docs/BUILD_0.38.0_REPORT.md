# Buy Local Sparta — Build 0.38.0 Report

**Release:** 0.38.0  
**Focus:** Atomic Vendor rescue routing + private S3-compatible media pipeline + automated malware scanning  
**Date:** 17 August 2026

## Executive summary

Build 0.38.0 closes two production-operation gaps remaining after the PostgreSQL and Viva payment cutovers.

First, Vendor rejection is no longer gated in PostgreSQL mode. Rejection/rescue is now one serializable database operation that releases the rejected supplier reservation, releases sticky assignment, performs a new fair supplier selection excluding the rejected supplier, reserves replacement stock, rewrites the order line, creates replacement fulfilment work, and preserves customer/order traceability. If no eligible rescue supplier exists, the order moves to `requires_customer_action` rather than becoming silently stranded.

Second, production Vendor media no longer has to remain binary-upload gated. Build 0.38 introduces private S3-compatible signed uploads, server-side upload verification, a durable scan queue, ClamAV INSTREAM malware scanning, authoritative SHA-256 computation, and a scan-then-promote object lifecycle. Media remains private and cannot become public until the automated malware state is clean and separate platform rights/moderation controls approve it.

The implementation retains Build 0.37 Viva payment handling and adds a paid-stock hardening migration so opportunistic stock reservation calls cannot expire stock belonging to a paid/confirmed order.

No live PostgreSQL/PostGIS, S3-compatible bucket, ClamAV service or real Viva merchant environment was available inside this execution environment. Those paths are configured for deployment/CI evidence but are not represented as locally executed production proof.

## 1. Atomic Vendor rejection and rescue

### PostgreSQL workflow

`PostgresCustomerCommerceService.rejectVendorFulfilment()` now performs Vendor rejection and rescue in a serializable transaction.

The operation:

1. Locks the target fulfilment and parent customer order.
2. Verifies the authenticated Vendor owns the fulfilment.
3. Returns idempotently if the fulfilment is already rejected.
4. Rejects only an `awaiting_acceptance` fulfilment belonging to an eligible confirmed order.
5. Locks the fulfilment's customer order lines.
6. Marks the original fulfilment rejected.
7. Releases the rejected supplier's active stock reservation.
8. Releases the associated sticky fairness assignment.
9. Re-evaluates canonical product/publicability and stock eligibility.
10. Excludes the rejected Vendor/offer from rescue selection.
11. Uses the existing Fair Vendor Exposure engine with rescue attribution.
12. Reserves replacement stock before changing the customer order line.
13. Reassigns the existing order line to the replacement offer/Vendor/location.
14. Creates replacement `awaiting_acceptance` fulfilment work.
15. Records `rescued_from_fulfilment_id` for operational traceability.
16. Preserves the already quoted customer delivery charge exactly once rather than re-pricing the customer during rescue.
17. Writes a customer-visible order timeline event.

### No-rescue behavior

If a line has no eligible rescue supplier, the affected line is cancelled and the parent order moves to `requires_customer_action`. The database path therefore does not leave a rejected Vendor leg silently stranded.

### Idempotency

Replaying rejection after a successful rescue does not perform a second reassignment. The already rejected fulfilment/order state is returned instead.

### Vendor isolation

The rejection entry point remains Vendor-scoped and verifies ownership server-side. Another merchant cannot reject or reroute a fulfilment it does not own.

## 2. Migration 0032 — rescue + paid-reservation hardening

New migration:

`0032_vendor_rescue_paid_reservation_hardening.sql`

It adds:

- `fulfilment_orders.rescued_from_fulfilment_id`;
- rescue traceability index;
- an updated `reserve_stock()` implementation that does not opportunistically expire active reservations attached to payment-confirmed/fulfilled/refunded/disputed orders.

This closes an important cross-path inconsistency: the scheduled reservation expiry worker already protected paid orders, but a later call to `reserve_stock()` could previously perform its own expiry logic. Paid reservations are now protected in both paths.

The Build 0.37 Viva capture path was also corrected to stop writing a nonexistent `stock_reservations.updated_at` column.

## 3. Private object-storage package

New workspace:

`packages/object-storage`

The S3-compatible adapter provides:

- short-lived presigned PUT upload URLs;
- signed Content-Type;
- private object keys;
- HEAD verification;
- streaming reads;
- conditional verified-object promotion;
- object deletion;
- bucket readiness checks;
- optional custom S3-compatible endpoint/path-style mode;
- workload/IAM credentials by default, with explicit static-key support when required.

Production credentials are never returned to the browser. The browser receives only the scoped temporary upload URL and required signed headers.

## 4. Durable media upload lifecycle

New migration:

`0033_media_upload_pipeline.sql`

It introduces durable `media_upload_intents` plus scan lease/retry/storage-verification fields.

### Vendor upload workflow

1. Authenticated Vendor requests an upload intent through `/api/vendor/media/intents`.
2. Server verifies Vendor ownership/approved catalog relationship, type, size and required rights/alt metadata.
3. PostgreSQL records an expiring private upload intent.
4. Server creates a short-lived S3-compatible presigned PUT URL.
5. Browser uploads directly to private staging storage.
6. Browser calls `/api/vendor/media/complete`.
7. Server performs storage HEAD verification against the trusted upload intent.
8. The resulting media asset remains `pending` for malware scan, rights review and moderation.

The Vendor cannot self-mark malware status, rights approval or moderation approval.

### Current type/size policy

The prepared MVP allowlist accepts bounded:

- JPEG;
- PNG;
- WebP;
- MP4;
- WebM;
- PDF.

The default maximum is 25 MiB and remains deployment configurable.

## 5. Automated ClamAV malware scanning

New workspace:

`packages/media-processing`

`ClamAvScanner` implements the ClamAV INSTREAM protocol over a private TCP connection with:

- bounded connection/scan timeout;
- 4-byte big-endian stream chunk framing;
- explicit zero-length terminator;
- size enforcement;
- clean/infected response parsing.

New worker:

`workers/media-worker.ts`

The worker:

- claims media scan work through PostgreSQL leases;
- streams the private object without buffering the whole file in application memory;
- computes authoritative SHA-256 while the same byte stream is sent to ClamAV;
- records infected/failed/clean scanner state;
- uses bounded retry/backoff;
- deletes infected staging objects;
- removes abandoned expired upload objects.

ClamAV is expected to be reachable only on private infrastructure. Its TCP service must not be exposed publicly.

## 6. Scan-then-promote / TOCTOU protection

A final security review identified a subtle object-storage race: the original presigned staging PUT URL may remain valid for a short time after upload completion. Merely scanning the staging key and later approving that same key could allow the object to be overwritten after the clean scan.

Build 0.38 closes this race.

For a clean scan:

1. Worker reads the staging object and records its ETag.
2. The exact stream is hashed and malware-scanned.
3. A clean object is conditionally copied to a new private verified key.
4. The copy uses an ETag precondition so promotion fails if the staging object changed after scanning began.
5. PostgreSQL updates the media asset to reference the verified key only.
6. The original staging key is deleted.

Admin moderation therefore operates on a verified object that the original upload URL cannot subsequently overwrite.

## 7. Platform governance remains separated

The scanner owns only malware state.

In PostgreSQL production mode, Admin is explicitly prevented from manually setting media to `scan_clean` or `scan_infected`. Admin continues to control separate rights and moderation decisions after automated scan completion.

A file can therefore become public only after all applicable gates succeed:

- storage verification;
- automated malware scan = clean;
- rights approval;
- moderation approval;
- canonical product remains publicly eligible and not suppressed/under blocking recall/compliance hold.

## 8. Readiness and security configuration

The production readiness route now includes the media pipeline when `BLS_MEDIA_PIPELINE_ENABLED=true`.

Enabled media readiness checks require:

- PostgreSQL readiness;
- private object-storage bucket readiness;
- ClamAV PING/readiness.

The production CSP adds only the explicitly configured `BLS_MEDIA_UPLOAD_ORIGIN` to `connect-src`; arbitrary storage origins are not permitted.

Relevant environment configuration is documented in `.env.example` and `docs/MEDIA_STORAGE_RUNBOOK.md`.

## 9. CI/live integration proof prepared

The PostgreSQL integration smoke has been expanded with two new cross-instance proofs.

### Atomic rescue proof

The configured live test creates a second eligible rescue supplier and verifies:

- original Vendor rejection;
- original stock reservation release;
- rescue Fair Vendor Exposure assignment;
- replacement reservation creation;
- replacement fulfilment visibility across runtimes;
- original fulfilment rejection state;
- idempotent replay.

### Media proof

The configured live test verifies across independent application runtimes:

- upload intent creation;
- upload-completion state;
- scan lease claiming;
- clean scan finalization against a verified object key;
- resulting Vendor trust projection visibility.

The real S3/ClamAV network path requires deployment credentials/services and remains a separate deployment proof.

## 10. Automated/local verification

The exact clean Build 0.38.0 source passed locally:

- **209 / 209 Core tests**;
- **7 / 7 Viva provider tests**;
- **3 / 3 ClamAV/media-processing tests**;
- **33 / 33 migration checksum/integrity checks**;
- project consistency/security/PostgreSQL/media gate;
- 4 / 4 development UI syntax checks;
- 6 / 6 structural accessibility checks;
- complete HTTP marketplace critical-journey smoke test;
- strict Core TypeScript validation;
- strict Viva adapter TypeScript validation;
- strict object-storage TypeScript validation;
- strict media-processing TypeScript validation;
- strict PostgreSQL-runtime TypeScript validation;
- strict media-worker TypeScript validation;
- semantic PostgreSQL integration-smoke TypeScript validation;
- AST scan of **339 TS/TSX files** with **0 missing relative imports**.

The strict semantic checks used temporary local validation shims because this environment does not have the complete installable dependency tree. Those shims were removed before final packaging, and `npm run check` was run again successfully on the clean source tree.

## 11. Remaining production gates

Build 0.38 prepares but does not claim completion of the following external evidence:

1. Actual PostgreSQL 18 + PostGIS migrations and multi-instance integration smoke in CI/deployment.
2. Real Node 24 `next build` after dependency installation.
3. Private S3-compatible bucket configuration, encryption/lifecycle/CORS/IAM validation.
4. Private ClamAV deployment, malware-signature updates and operational alerting.
5. End-to-end upload → malware scan → rights/moderation → CDN/public delivery test with real storage.
6. Real Viva demo merchant credentials and controlled payment/refund/webhook evidence.
7. ERP/myDATA and courier provider integrations.
8. Production search/notification provider activation and operational alerting.

## 12. Current release boundary

Build 0.38 now provides a coherent production-oriented path for:

- PostgreSQL Customer/Vendor/Admin state;
- PostgreSQL commerce and stock reservations;
- Viva Smart Checkout/refunds/webhooks;
- atomic Vendor rejection/rescue routing;
- private direct media uploads;
- durable automated malware scanning;
- immutable verified-object promotion;
- separate rights/moderation governance.

The next highest-value work is live deployment evidence and the remaining external adapters: ERP/myDATA, courier integration, production search/notifications, plus actual S3/ClamAV/Viva staging validation.

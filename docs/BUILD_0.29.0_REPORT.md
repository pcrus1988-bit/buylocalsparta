# Buy Local Sparta — Build 0.29.0 Report

## Scope

Build 0.29.0 expands the authenticated production Next.js Vendor Backoffice from orders/inventory into the deeper merchant workflows already present in Core.

## Added production-web Vendor surfaces

- `/vendor/catalog` — manual source products, matching submission and CSV dry-run/explicit-confirm import.
- `/vendor/trust` — vendor-bound image/video/PDF upload plus compliance-document submission.
- `/vendor/advice` — own conversations, appointments, Ask Local/private-offer state and notifications.
- `/vendor/finance` — own procurement, supplier invoice submission and read-only settlement tracking.
- `/vendor/analytics` — Core vendor-scoped 30-day aggregate only.
- `/vendor/returns` — assigned return/replacement/repair operational queue only.

## Governance boundaries preserved

- Every new mutation requires authenticated Vendor session + CSRF.
- Vendor IDs are re-derived from the signed principal; request bodies cannot choose vendor scope.
- Media finalization binds to the authenticated vendor.
- Media remains pending malware scan/rights/moderation after merchant upload.
- Compliance remains pending platform verification.
- Catalog match approval, canonical creation/offer approval are not exposed to Vendor APIs.
- Payable approval, settlement maker/checker approval and payout references are not exposed to Vendor APIs.
- Return eligibility, inspection and remedy decisions remain platform-owned.
- Vendor analytics contains only own aggregate metrics and is not an input to Fair Vendor Exposure.

## Verification

- 209/209 Core tests passing.
- 28/28 immutable SQL migrations verified.
- Project consistency/security gate passing, including new Vendor governance checks.
- 4/4 generated development UI syntax checks passing.
- 6/6 structural accessibility checks passing.
- Full dependency-free HTTP marketplace smoke workflow passing.
- 75 production-web TS/TSX files syntax-transpiled with zero parse diagnostics.
- Relative-import resolution scan passing.
- Direct Vendor operations runtime proof passing: scoped approved catalog bootstrap → manual product submit → CSV dry-run/commit → vendor-bound media upload remains pending → compliance remains pending → analytics/finance projection.

## External production gates

A genuine Node 24 `next build` remains a CI/deployment requirement because this environment does not contain the installable Next/React dependency tree. Multi-instance launch also remains gated on PostgreSQL shared persistence, S3/malware scanning, provider notifications, PSP, ERP/myDATA and courier adapters.

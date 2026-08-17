# Buy Local Sparta — Staging Activation & Evidence Runbook

Build 0.42 introduces a release-evidence layer over the production adapters. Its purpose is to distinguish **configured**, **reachable** and **actually proven** integrations.

## Evidence levels

1. **Configuration** — required deployment variables/secrets exist and pass local validation.
2. **Connectivity** — a read-only provider call succeeds for the exact environment/account used by the deployment.
3. **Scenario** — an end-to-end staging scenario is exercised and an operator records the outcome for the exact BLS build.
4. **Deployment** — the deployed `/api/health/ready` endpoint reports the same build and all critical enabled dependencies ready.

Activation evidence is append-only in PostgreSQL. It stores a provider/check/build/environment/status, redacted details and a SHA-256 digest of an optional external reference. It does **not** store credentials, webhook secrets, API keys or full provider payloads.

## Read-only preflight

Set the staging environment variables and require the providers that must be proven:

```bash
export BLS_DEPLOYMENT_ENVIRONMENT=staging
export BLS_ACTIVATION_REQUIRED_PROVIDERS=database,viva,mydata,search,email,object_storage,clamav,boxnow,web
npm run stage:preflight -- --record --web-url="https://staging.example.gr"
```

The preflight uses only non-customer-facing/read-only checks:

- PostgreSQL/PostGIS schema readiness;
- Viva OAuth Smart Checkout scope plus webhook-key credential verification (no payment order is created);
- AADE `RequestTransmittedDocs` for the current Athens date (no invoice is issued);
- Meilisearch `/health`;
- Resend authenticated domain listing and sending-domain verification (no email is sent);
- S3-compatible bucket HEAD;
- ClamAV PING;
- BOX NOW origin listing through Partner API (no parcel is created);
- deployed BLS `/api/health/ready`, including exact build identity.

Read-only evidence defaults to a 72-hour lifetime. A successful check for an old build or an expired check must not be treated as proof for a new release.

## Required staging scenarios

Connectivity is not launch evidence by itself. Before live activation, retain scenario evidence for the appropriate provider.

### PostgreSQL / application

- two-instance session restoration and revocation;
- persistent cart and checkout idempotency;
- last-unit oversell contention;
- Vendor and Admin tenant/RBAC boundaries;
- atomic Vendor rescue after rejection;
- migration/readiness from a fresh database.

These are already represented in `scripts/db-integration-smoke.ts`; retain the successful CI run URL/digest as scenario evidence.

### Viva demo

- Smart Checkout successful payment;
- failed/abandoned payment;
- full refund;
- partial refund if enabled by the approved return workflow;
- duplicate/out-of-order webhook delivery;
- cancellation followed by late capture and exactly-one automatic refund;
- manual-reconciliation path for uncertain provider outcome.

No real customer money is used in staging.

### BOX NOW stage

- locker selection;
- Vendor-origin mapping;
- delivery request creation;
- PDF label retrieval;
- handover;
- signed tracking webhook;
- final-destination/locker-ready state;
- delivery;
- expiry/return/cancellation scenarios;
- timeout/reconciliation by stable fulfilment order number.

### Object storage + ClamAV

- valid image upload to private staging key;
- storage verification;
- clean ClamAV scan;
- ETag-conditional promotion to verified key;
- Admin rights/moderation approval;
- infected test-object rejection using an approved malware-test fixture;
- expired unfinished upload cleanup.

### Meilisearch

- index configuration;
- full canonical rebuild;
- Greek/Greeklish query;
- filter and price sort;
- recall/compliance suppression removes the product from results;
- hidden supplier offers never appear in the index.

### Resend

- verified sending domain;
- payment confirmation delivered to a controlled staging inbox;
- refund email delivered;
- signed webhook reconciliation;
- webhook redelivery/deduplication;
- bounce/complaint suppression using a controlled test destination where available.

Resend recommends a verified sending domain and exposes read-only domain status through its domain APIs; BLS preflight verifies the configured `RESEND_FROM` domain rather than sending an email.

### AADE myDATA

- read-only test-environment connectivity may be proven immediately;
- **invoice issuance must remain blocked** until `BLS_MYDATA_MAPPING_VERSION` names the accountant-approved seller-of-record mapping;
- after approval, execute controlled test invoice/classification/cancellation scenarios and retain MARK/UID evidence without storing credentials in the activation ledger.

## Recording scenario evidence

After a controlled scenario, record only a non-secret external reference (for example a CI run ID or provider sandbox reference). BLS stores only its SHA-256 digest:

```bash
npm run stage:evidence -- \
  --provider=viva \
  --check=demo-payment-refund \
  --status=passed \
  --evidence="sandbox-reference-or-ci-url" \
  --note="Controlled staging account; refund confirmed by webhook"
```

The Admin Command Centre exposes the latest evidence at `/admin/activation`.

## GitHub workflows

- `.github/workflows/staging-activation.yml` performs the read-only cross-provider preflight and records its result.
- `.github/workflows/staging-scenario-evidence.yml` records an operator-confirmed scenario result after the actual staging exercise.

If S3/ClamAV are private-network services, configure `BLS_ACTIVATION_RUNNER` to a self-hosted runner with private network access. Never expose ClamAV publicly just to make a hosted CI runner reach it.

## Promotion rule

Do not promote staging configuration to live merely because `/api/health/ready` is green. Promotion requires:

- current-build connectivity evidence for every required provider;
- current, non-expired scenario evidence for money movement, shipment lifecycle and media processing;
- approved legal/accounting gates for Viva/myDATA;
- a real Node 24 Next.js production build and PostgreSQL/PostGIS CI result;
- production credentials stored in the deployment secret manager, not repository files.

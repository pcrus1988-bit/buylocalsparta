# Buy Local Sparta — Build 0.39.0 Report

**Release:** 0.39.0  
**Focus:** AADE myDATA ERP transport preparation + courier-integration readiness  
**Status:** verified source checkpoint; real AADE credentials/accounting mapping and a selected courier remain launch/staging gates

## Executive summary

Build 0.39.0 prepares a production-grade AADE myDATA ERP transport boundary without inventing the still-unapproved Greek accounting treatment of Buy Local Sparta's seller-of-record model.

The platform can now be configured to authenticate to the AADE ERP API, transmit already-approved XML, persist MARK/UID/QR/error/cancellation state, query/cancel documents and surface the state in the Admin workspace. Transmission is intentionally fail-closed: credentials alone do not activate tax issuance, and every outgoing document must match an explicitly configured accountant-approved mapping version.

The release also documents the normalized courier integration contract and provider-selection requirements. No fake generic courier API has been added because quote, label, tracking, webhook, return and geographic-service contracts differ materially by carrier. The existing shipment domain remains the stable abstraction for the first selected real provider.

## 1. AADE myDATA transport package

New workspace:

`packages/aade-mydata`

Prepared capabilities:

- configurable test/production AADE endpoint;
- ERP authentication headers;
- invoice XML transmission;
- income-classification transmission;
- expense-classification transmission;
- invoice cancellation by MARK;
- transmitted-document retrieval;
- document retrieval;
- bounded HTTP timeout;
- structured XML response parsing;
- MARK/UID/QR extraction;
- structured rejection-error extraction;
- XML DOCTYPE rejection;
- safe configuration validation.

The production default API spec is configured separately from test. Test requires an explicit base URL so a moving AADE test endpoint/spec cannot silently become a production assumption.

## 2. Accounting mapping remains deliberately gated

Build 0.39 does **not** generate arbitrary Greek tax XML from marketplace orders.

Automatic issuance requires both:

- `BLS_MYDATA_ISSUANCE_ENABLED=true`
- an accountant-approved `BLS_MYDATA_MAPPING_VERSION`

Each prepared tax document must carry the exact approved mapping version before transmission.

The following remain professional-accounting/legal decisions rather than code guesses:

- customer B2C/B2B invoice/receipt type;
- VAT/category treatment;
- income and expense classification codes;
- supplier invoice/self-billing treatment;
- platform service-fee treatment;
- credit-note/refund mapping;
- shipping/delivery tax treatment;
- Digital Goods Movement applicability and lifecycle.

## 3. Durable AADE persistence

New migration:

`0034_aade_mydata_erp_bridge.sql`

The repository now contains **34 verified migrations**.

The migration adds durable state for:

- mapping version;
- invoice type code;
- document series/sequence;
- issue date;
- AADE MARK;
- AADE UID;
- QR URL;
- cancellation MARK;
- transmission lifecycle;
- latest transmission/error state;
- append-only/non-blind transmission attempts;
- environment/spec version;
- request hash and response snapshot.

The attempt key is unique per document/operation. An uncertain network outcome is persisted as manual review rather than automatically retransmitted, preventing duplicate tax-document transmission after a timeout or ambiguous provider response.

## 4. PostgreSQL myDATA service

`PostgresMyDataService` now provides platform-scoped tax operations.

Before transmission it verifies:

- Admin/platform permission;
- issuance is explicitly enabled;
- the document is marked ready;
- its mapping version exactly matches the configured approved mapping;
- approved XML exists;
- no previous ambiguous attempt may be blindly replayed.

On acceptance it persists the authoritative AADE identifiers/state. On structured rejection it stores the rejection detail. On an ambiguous network result it changes the attempt/document to manual reconciliation.

## 5. Admin Tax / myDATA workspace

New production Admin surface:

`/admin/tax`

It exposes:

- configured AADE environment/spec;
- issuance-gate state;
- active mapping version;
- tax-document transmission state;
- MARK/UID/QR values;
- provider errors/manual-review state;
- transmit action only for eligible, prepared documents.

The transmit endpoint remains Admin-authenticated and CSRF protected.

## 6. Readiness and deployment configuration

Readiness now includes the myDATA dependency when issuance is enabled.

Credentials alone do not activate issuance.

New environment configuration includes:

- `BLS_MYDATA_ISSUANCE_ENABLED`
- `BLS_MYDATA_MAPPING_VERSION`
- `AADE_MYDATA_ENVIRONMENT`
- `AADE_MYDATA_BASE_URL`
- `AADE_MYDATA_USER_ID`
- `AADE_MYDATA_SUBSCRIPTION_KEY`
- `AADE_MYDATA_SPEC_VERSION`
- `AADE_MYDATA_REQUEST_TIMEOUT_MS`

A read-only connectivity command is prepared:

`npm run mydata:check`

It queries transmitted-document state and does not create a tax document.

No real AADE credential/network call was performed in this local execution environment.

## 7. AADE version discipline

At release preparation time, the official AADE production technical page publishes ERP specification **v2.0.1** while the AADE test environment advertises **v2.0.2** with additional/evolving Digital Goods Movement capabilities.

Build 0.39 therefore keeps:

- environment;
- base URL;
- API/spec version

explicitly configurable instead of assuming test and production advance simultaneously.

Digital Goods Movement is treated as a separate integration gate rather than inferred from invoice transmission.

## 8. Courier integration preparation

New:

`docs/COURIER_INTEGRATION_RUNBOOK.md`

The project deliberately does **not** invent a generic carrier REST schema before selecting the real provider.

The provider-selection/integration contract now records the required capabilities for the first implementation:

- serviceability/postcode/island rules;
- dimensional/weight limits;
- customer delivery quotes;
- label creation/cancellation;
- tracking identity;
- pickup/handover events;
- signed/idempotent webhook handling;
- delivery confirmation controlled by the carrier;
- return labels/reverse logistics;
- COD policy if ever allowed;
- GDPR/data-retention obligations;
- rate limiting/error handling;
- reconciliation;
- interaction with AADE Digital Goods Movement requirements.

The existing normalized shipment lifecycle remains the application boundary, so a selected carrier adapter will not need to rewrite marketplace/order semantics.

## 9. Documentation and consistency hardening

Updated:

- README release identity and production boundary;
- Project Status;
- Roadmap;
- API documentation;
- Legal/Tax/Payment Technical Gate;
- environment template;
- production CI;
- project consistency gate.

The consistency gate now verifies:

- release-package version alignment;
- AADE package/dependency wiring;
- required scripts;
- Next.js transpilation configuration;
- AADE environment variables;
- Admin CSRF protection;
- official AADE authentication-header usage;
- mapping-version gate;
- manual-reconciliation behavior;
- conditional readiness behavior;
- runbook documentation.

## 10. Tests and verification

The exact clean Build 0.39 source passed:

- **209 / 209 Core tests**
- **7 / 7 Viva payment-adapter tests**
- **4 / 4 AADE myDATA adapter tests**
- **3 / 3 media/ClamAV tests**
- **34 / 34 migration integrity checks**
- project consistency/security/PostgreSQL/myDATA gate
- **4 / 4 development UI syntax checks**
- **6 / 6 accessibility structural checks**
- complete marketplace HTTP critical-journey smoke test
- strict myDATA TypeScript validation (temporary validation harness, removed before packaging)
- strict PostgreSQL-runtime TypeScript validation (temporary validation harness, removed before packaging)
- **345 TS/TSX production/source files parsed**
- **0 parse errors**
- **0 missing relative imports**

After the temporary type-validation shims were removed, the complete dependency-free `npm run check` suite was rerun and passed.

## 11. Explicitly not claimed

Build 0.39 does **not** claim:

- a real AADE test/production network transaction;
- accountant approval of BLS tax-document/classification mapping;
- automatic tax XML generation;
- activation of AADE Digital Goods Movement;
- a selected/contracted production courier API;
- a real courier quote/label/webhook transaction;
- a local live PostgreSQL/PostGIS execution;
- a local genuine Node 24 `next build` with freshly installed dependencies.

Those remain staging/CI/provider/professional-approval gates.

## 12. Recommended next sequence

1. Obtain AADE/myDATA test credentials and accountant-approved mapping specification.
2. Prepare representative BLS tax fixtures and validate them in the AADE test environment before enabling issuance.
3. Confirm whether/when Digital Goods Movement applies to BLS platform→supplier/customer fulfilment flows and implement the approved methods separately.
4. Select the first courier/provider and implement its adapter against the existing shipment contract.
5. Run the existing PostgreSQL/PostGIS + Node 24 CI pipeline and retain evidence.
6. Continue production search and notification-provider integration after the transactional external gates are proven.


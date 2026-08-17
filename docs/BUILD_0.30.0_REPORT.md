# Buy Local Sparta — Build 0.30.0 Report

**Release date:** 15 August 2026  
**Base:** Build 0.29.0  
**Release type:** Production-web Admin Command Centre + consistency hardening

## Executive summary

Build 0.30.0 adds the first authenticated production Next.js Admin Command Centre on top of the existing Core governance services. The release does not invent a parallel admin business layer: vendor onboarding, product matching, trust/compliance decisions, procurement/payable controls, settlement maker/checker rules, fairness governance, health, security telemetry and audit all delegate to existing Core invariants.

The release also fixes a pre-existing production-web TypeScript immutability issue found during validation: several Vendor projections called `.sort()` directly on readonly arrays returned by Core. Those projections now clone service results before sorting, preserving Core immutability and avoiding a likely real TypeScript/Next build failure.

## Production Admin surfaces added

- `/admin/login` — dedicated platform-staff authentication.
- `/admin` — command-centre overview, market metrics, readiness and security summary.
- `/admin/vendors` — merchant/KYB/onboarding transitions through the governed state machine.
- `/admin/matching` — Product Matching Centre, canonical creation and supplier-offer approval.
- `/admin/trust` — media scan/review and compliance verification/rejection.
- `/admin/finance` — procurement payable approval and governed settlement lifecycle.
- `/admin/fairness` — merchant exposure snapshots and fairness-appeal review/resolution.
- `/admin/operations` — dependency readiness, privacy-minimised security events and audit visibility.

## Admin security and governance boundaries

- Admin sessions are independent of customer and Vendor sessions.
- Platform roles are checked through Core RBAC before protected projections/actions are returned.
- Login is rate-limited against the trusted opaque `x-bls-visitor` identity.
- Admin cookies remain `HttpOnly` and `SameSite=Strict`; secure cookies are used in production/HTTPS contexts.
- All Admin mutation routes require authenticated session + CSRF and re-check the required platform permission.
- Development-only staff accounts are not seeded in real production.
- The in-memory Admin runtime fails closed in production unless `BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME=true` is explicitly enabled for a preview.
- Durable multi-instance production remains gated on PostgreSQL-backed staff identity, audit and governance persistence.

## Functional controls implemented

### Vendor / KYB
Admin can advance or reject merchant applications only through the Core onboarding state machine. Required verification, catalog and test-ready gates cannot be skipped by the UI.

### Product Matching
Admin can approve/reject submitted source-product matches, create a canonical product from an unmatched source and approve the resulting hidden supplier offer. Supplier economics and competitor offers remain private from merchants/customers.

### Trust / compliance
Admin can record scan outcomes and perform rights/moderation review plus compliance-document verification/rejection. Vendor submissions remain pending until platform review; merchants still cannot self-approve evidence.

### Finance
Admin can approve eligible procurement to payable and operate settlement batches. The existing Core maker/checker invariant is preserved: the settlement maker cannot approve the same batch. A separate `platform_finance` checker account can approve, after which an external payout reference can close the batch.

### Fairness
Admin can review merchant fairness snapshots and appeals without changing the core principle that paid plan, supplier price, conversion performance and analytics do not buy organic identical-product exposure.

### Operations
Admin receives readiness, security-event and audit projections using existing privacy-minimised telemetry and platform permissions.

## Additional consistency fix

During Admin validation, the production-web layer exposed a pre-existing Build 0.29 issue in `vendor-operations-runtime.ts`: readonly arrays returned by Core services were being sorted in place. JavaScript runtime tests did not surface it, but TypeScript can reject mutating methods on readonly arrays. All affected Vendor projections now use copied arrays (`[...items].sort(...)`) before presentation sorting.

## Regression protection added

`npm run check:consistency` now also verifies:

- Admin cookie remains HttpOnly + SameSite=Strict.
- Admin login retains trusted visitor rate limiting.
- Admin session retains CSRF and Core permission enforcement.
- ephemeral Admin state remains fail-closed for production.
- the Admin preview gate is documented in `.env.example`.
- all Admin mutation routes retain authenticated CSRF protection.
- settlement maker/checker separation remains present.

## Direct Admin runtime proof

A direct integration proof against the actual shared Core services passed the following chain:

1. platform Admin authentication;
2. vendor onboarding transition;
3. vendor source product submission;
4. Admin match approval;
5. Admin supplier-offer approval;
6. media upload → clean scan → rights/moderation approval;
7. compliance evidence → verification;
8. fulfilled customer order → procurement accrual;
9. supplier invoice matching;
10. procurement payable approval;
11. settlement batch creation/submission;
12. maker self-approval rejected;
13. independent finance checker approval;
14. payout reference recorded and settlement paid;
15. fairness appeal resolution;
16. operational health and audit projection.

Proof result included `health=healthy`, catalog approved, media approved, compliance verified, settlement paid, `selfApprovalBlocked=true`, and audit events present.

## Final verification

Run against the exact versioned Build 0.30.0 source:

- **209/209 Core tests passed**.
- **28/28 immutable SQL migrations verified by checksum**.
- project consistency/security gate passed.
- **4/4** dependency-free development UI JavaScript syntax checks passed.
- **6/6** structural accessibility interface checks passed.
- complete HTTP critical-journey smoke test passed.
- **98** production Next.js TypeScript/TSX files syntax-transpiled with **0 errors**.
- production-web relative-import resolver found **0 missing imports**.
- temporary proof `node_modules`/workspace symlink removed before packaging.

No registered SQL migration was edited.

## Validation not claimed

A genuine Node 24 `next build` is still an external CI/deployment gate. The current execution environment does not provide the installed Next/React workspace dependency tree and cannot freshly fetch it from the npm registry, so this report does **not** claim a successful framework build.

Likewise, production readiness still requires live PostgreSQL/PostGIS migration/integration/concurrency proof and the external adapters/approvals already documented for PSP/payment, ERP/myDATA/digital dispatch, S3/media scanning/CDN, courier/geocoding, email/SMS/push and Google Calendar/Meet.

## Recommended next development slice

Extend the production Admin workspace to the remaining Core-backed operational areas: consolidated orders/returns, review moderation, privacy-request processing, category governance, CMS/SEO, recall/search/notification-worker controls and deeper market analytics. In parallel, prioritize the PostgreSQL runtime cutover so customer, Vendor and Admin sessions/governance stop depending on preview-only in-memory state.

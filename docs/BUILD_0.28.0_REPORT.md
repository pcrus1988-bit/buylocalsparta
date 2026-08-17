# Buy Local Sparta — Build 0.28.0 Report

**Date:** 15 August 2026  
**Baseline:** Build 0.27.0  
**Release type:** Production-web merchant operations + customer order-control milestone

## Scope completed

Build 0.28.0 adds the first authenticated production Next.js Vendor Backoffice while preserving the existing Core domain implementation and the 0.27 customer-account security model.

### Vendor authentication and isolation

- Added `/vendor/login` and private `/vendor` backoffice routes.
- Vendor sessions use an HttpOnly, SameSite cookie and the existing signed-session Core contract.
- Login is rate-limited by the trusted opaque browser identity injected by `proxy.ts`.
- Every state-changing vendor request requires the session-specific CSRF token.
- Vendor identity is re-authorized server-side from `principal.vendorId`; client-supplied offer/fulfilment IDs cannot cross merchant scope.
- The ephemeral vendor runtime is lazy and fails closed in production unless the explicit preview-only `BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME=true` override is set.

### Vendor dashboard and inventory

The private dashboard now exposes only the authenticated merchant's:

- assigned fulfilments,
- canonical-product supplier offers,
- on-hand / reserved / safety / blocked / available-to-sell stock,
- public retail price and that merchant's supplier price,
- basic operational metrics,
- non-payable supplier-value snapshot.

Stock changes use the existing `InventoryEngine.adjustOnHand` path and record actor/source. An update is rejected when `onHand` would fall below active customer reservations.

### Vendor fulfilment actions

The backoffice supports only controlled actions:

- accept assigned fulfilment,
- reject assigned fulfilment and allow existing rescue routing,
- mark pickup ready only after the overall customer order is confirmed,
- confirm local-delivery completion only after confirmation.

Carrier shipping delivery is intentionally not available as a merchant action. Provider-confirmed shipping delivery remains the authoritative path.

### Customer order detail and cancellation

- Account order rows now link to `/account/orders/[id]`.
- The detail surface shows authoritative Core totals, line state and local fulfilment-partner status.
- Order access is customer-owned; another customer's order ID resolves as unavailable.
- Pre-handover cancellation is authenticated + CSRF protected.
- Cancellation delegates to the existing Core order-cancellation invariant, including authorization cancellation/refund and reservation reversal.
- Once pickup handover is ready, a shipment is handed over, or delivery occurred, cancellation is no longer exposed; return/withdrawal workflows remain the correct path.

## Regression protection added

`check:consistency` now additionally rejects regressions where:

- vendor session cookie stops being HttpOnly,
- vendor login loses trusted visitor-scoped abuse limiting,
- vendor mutations lose CSRF enforcement,
- ephemeral vendor state becomes silently production-enabled,
- vendor stock/fulfilment ownership guards disappear,
- merchants gain a self-confirmed carrier-delivery path,
- customer order cancellation loses authenticated CSRF protection,
- the vendor preview-runtime environment gate is undocumented.

## Verification

Final Build 0.28.0 verification completed successfully:

- project consistency/security gate: **PASS**
- immutable SQL migration verification: **28/28 PASS**
- Core automated tests: **209/209 PASS**
- development UI syntax verification: **4/4 PASS**
- structural accessibility checks: **6/6 PASS**
- dependency-free HTTP critical-journey smoke: **PASS**
- production-web dependency-free TypeScript/TSX syntax transpilation: **53 files, 0 parse errors**

No existing immutable SQL migration was changed.

## Production validation intentionally still open

A genuine `next build` is not claimed in this execution environment because the Next/React dependency tree cannot be freshly installed from the npm registry here. The production target remains Node 24 and should run `npm run check:web` in CI/deployment.

The customer and vendor Next.js adapters currently use deterministic in-memory state for executable preview. They explicitly fail closed in production by default. Multi-instance launch requires the already-prepared PostgreSQL identity/session/vendor/commerce persistence cutover and live database concurrency/RLS verification.

Real PSP payment capture, AADE/ERP tax-document activation, courier provider credentials and legal/accounting approvals remain governed launch gates.

## Recommended next slice

1. Extend the production Vendor Backoffice with catalog product creation/import, source-product matching status and governed media/compliance evidence.
2. Add vendor advice/appointments/notifications using the existing Core advice services.
3. Expose vendor-only aggregate analytics and supplier invoice/settlement status without competitor/customer leakage.
4. Add customer returns/guarantee and advice/appointment history to the production account.
5. Begin production Admin command-centre migration after vendor operational coverage reaches parity with the dependency-free workspace.

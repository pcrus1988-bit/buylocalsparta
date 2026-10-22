# DrinkStock POS-unavailable fallback — existing KONTA MOY Mollie + AADE

**Operator decision, 20 October 2026:** The *admin-approved fallback* uses the existing central KONTA MOY Mollie account and its existing AADE/myDATA technical connection. Partner owners must **not** sign up for a new Mollie account or provide their own AADE credentials for this fallback.

## Actual implementation
- Shared provider interface: `apps/web/src/lib/drinkstock-platform-fallback-provider.ts` imports the established `mollie-runtime.ts`, `mydata-runtime.ts` and platform-owned `@buy-local-sparta/mollie-payments` client, preserving credentials, environment and monitoring in the existing centrally managed runtime.
- Partner-scoped owner/manager status: `/drinkStock/dashboard/{partnerId}/payments` and `GET /api/hospitality/partners/{partnerId}/platform-fallback`; no external API keys, AADE secrets or bank details in responses.
- Each future Mollie payment contains stable order/partner/venue metadata, exact integer EUR cents and first-party return/webhook URLs. Server-side payment verification retrieves Mollie payment information using the existing KONTA MOY credential and checks **paid**, EUR, correct amount, order ID, partner and venue.
- Previous partner OAuth and partner AADE credential endpoints return 410 by default for this fallback. The historical merchant-connection schema remains intact; no records or secrets were deleted.
- **No public guest charge route exists.** `PLATFORM_PAYMENT_RELEASED` is false, irrespective of marketplace Mollie readiness. Read-only platform diagnostics do not authorize a charge.

## Critical legal distinction: account owner versus seller/receipt issuer
Using KONTA MOY's existing **Mollie account** makes KONTA MOY the payment owner under that payment-account arrangement. Whether the *bar* remains the seller or KONTA MOY itself becomes the legally authorized seller must be established contractually and aligned with Mollie's permitted marketplace/collection model. Mollie does not permit unrestricted pass-through transfers of consumer funds to unrelated merchants.

Using KONTA MOY's existing **AADE technical connection** likewise does **not** automatically authorize KONTA MOY's tax identity to issue retail receipts for goods/services legally sold by a partner bar. If KONTA MOY is genuinely the legal seller, its issuer obligation must be established and the sale recorded correctly; if the bar remains the seller, its fiscal receipts must be issued under its own AFM through a legally authorized fiscal mechanism. Technical reuse alone does not change the issuer's identity. An ERP/myDATA transmission alone is not necessarily the lawful production retail receipt issuance method. Retail FHM/eSEND and licensed-provider channels have their own requirements.

References:
- Mollie Connect platform and marketplace responsibilities: https://docs.mollie.com/docs/connect-overview
- Mollie payment owner / access-token distinction: https://docs.mollie.com/docs/connect-process-payments
- Mollie marketplace payment routing (requires Mollie availability): https://docs.mollie.com/docs/connect-route-and-split-payments
- AADE eSEND / myDATA retail process: https://www.aade.gr/teleytaia-nea-mydata/odigies-heirismoy-diasyndesis-esend-mydata
- Certified invoice providers: https://www.aade.gr/mydata/parohoi-ypiresion-ilektronikis-timologisis

## Remaining production checkout contract
1. Obtain exact venue-by-venue legal seller, fulfillment, alcohol-sale licensing, invoicing and settlement authorizations. Approving generic POS fallback eligibility does not prove this.
2. Reconcile KONTA MOY's chosen Mollie account + authorized merchant-of-record or compliant marketplace collection routing with the actual legal seller and signed commercial agreements.
3. Implement **certified receipt issuance for the actual issuer** (not a draft, not merely successful myDATA reporting). Verify receipt ID/MARK/QR or other provider-required proof and tax mode per venue/drink.
4. Build one atomic, idempotent, scoped DrinkStock commercial order ledger, 15-second price locking, per-venue service-mode VAT, Mollie event reconciler, refunds/credits and reversals. Test pending/duplicate/out-of-order/late-paid events.
5. Only then introduce a distinct audited production release gate. Do not repurpose the marketplace checkout's customer/vendor settlement path or treat admin approval/diagnostics as final readiness.

**Operational status:** existing provider code is reused now; actual commercial guest payments remain disabled to prevent unintended legal merchant, tax or settlement misattribution.

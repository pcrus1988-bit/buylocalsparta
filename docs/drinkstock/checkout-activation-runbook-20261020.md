# DrinkStock POS-unavailable fallback: production checkout activation (20 October 2026)

## Verified baseline
- One partner currently has an admin-granted entitlement in `public.drinkstock_checkout_fallback`.
- At inspection time, the operational DrinkStock tables contained **zero orders, zero payment events, zero fiscal documents**.
- The public QR/table endpoint can only produce a server-priced **15-second price preview**. It cannot place orders, create payments, redirect to marketplace checkout, or issue a retail receipt.
- The existing marketplace Mollie/payment and seller-of-record paths must **not** be pointed at venue drinks: DrinkStock requires separate merchant/venue settlement, locked session pricing and hospitality VAT.
- KONTA MOY FISCAL draft/test API clients (e.g. `kmf_test_`) are not certified production retail receipt issuance. No test token qualifies as an authorized receipt provider.

## New owner workflow
- Open `/drinkstock/dashboard/{partnerId}/venues/{venueId}/checkout` from the venue Trading Floor.
- Authenticated owners/managers get their own venue's approval, product count, VAT-review backlog and provider-blocker checklist.
- `GET /api/hospitality/partners/{partnerId}/venues/{venueId}/checkout-readiness` exposes the same read-only readiness to this venue's owners/managers only. It returns no payout credentials, PSP secrets, guest/table tokens, or tax identifiers. The response is `private, no-store`.
- Settlement/PSP/fiscal/reversal/commercial order adapter capabilities are **hard-disabled** until verifiable integrations ship. Admin checkboxes attest that responsibilities were reviewed; they do not switch on operational provider capabilities.

## Implement in this order (non-skippable)
1. **Merchant of record.** Onboard each hospitality merchant legally, verify business and Greek VAT identity, scope one PSP merchant account to one partner/venue (or a formally authorized aggregation model) and persist a server-verified payout mapping. Never settle DrinkStock receipts to the KONTA MOY marketplace seller by default.
2. **Fiscal issue contract.** Select and certify the appropriate AADE-compliant hospitality retail receipt issuance path. Persist per-venue issuer credentials securely. Verify success from the actual fiscal provider (document ID / MARK where applicable) and model void/credit/refund separately; never treat a draft, a myDATA transmission request, or the payment provider response as an issued retail receipt.
3. **Tax context.** Record service mode (`dine_in`, `takeaway`, `delivery`), verified reduced-island eligibility, per-product reviewed VAT classifications and explicit tax rule version. Validate with the hospitality merchant's accountant. Calculate each VAT-inclusive line in integer euro cents.
4. **Immutable checkout intent.** Resolve opaque table pass server-side; authorize partner, venue and active session; take a transactionally locked product price snapshot with valid 15-second quote and deduplication UUID. Reject revoked pass, changed price, active session change, unreviewed VAT and out-of-scope products. Do not let guest-supplied amounts control payment capture.
5. **PSP.** Create a hosted/tokenized checkout for the authorized merchant, with strict amount/currency/venue/intent correlation. Persist PSP payment attempt IDs and a unique event key; authenticate the webhook *by fetching the payment server-to-server from the PSP* or a genuine provider-supported signature. Apply status and idempotency exactly once in a database transaction. Test failures, duplicate callbacks, pending, late paid, cancellation, partial refund, chargeback.
6. **Fiscal + dispatch.** Obtain provider-confirmed retail receipt issuance, store the immutable provider reference and verify against the paid intent. Only then expose the corresponding fulfilment action to bar and waiters; the existing `served` state guard continues to require a verified receipt. Send market demand once per verified commercial sale and never from demo trades.
7. **Release gate.** Require independent production smoke evidence for settlement, PSP reconciliation, receipts, refunds/credits, and atomic order writes. Activate per partner/venue through a distinct audited, server-side release procedure. No browser boolean, environment-only flag, or admin approval should enable charge creation.

## Operational fail-safe
If any PSP, settlement, VAT jurisdiction or fiscal provider is not verifiably ready, QR guests can still see a temporary quote, but the hosted payment button remains disabled and no commercial order is created. The manager readiness screen names the missing integration. A payment-authorized-but-fiscal-failed edge case, after future integration, must be placed in a durable reconciliation queue with automatic void/refund handling and operator escalation, not silently marked served.

### External authority
AADE licensed providers: https://www.aade.gr/mydata/adeiodotimena-logismika-parohon-ilektronikis-timologisis
AADE explanation of provider-issued documents: https://www.aade.gr/en/mydata/e-invoicing-service-providers

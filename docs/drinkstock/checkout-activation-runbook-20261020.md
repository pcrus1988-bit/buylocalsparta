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

## 20 October — transaction evidence, tax jurisdiction and owner readiness

The checkout activation page now reads the actual per-partner merchant-owned Mollie capability record (enabled payments/settlements, selected profile, active connection checked within 7 days), the merchant's recorded AADE/receipt-issuer connection state and an **owner-reviewed standard mainland VAT jurisdiction**. Owner confirmation is audited in `drinkstock_venue_tax_context_events`; it requires a 20–600 character rationale and is restricted to the **standard dine-in** regime. No reduced-island VAT can be self-certified here; those locations require separate evidence and a different activation workflow.

An authenticated Mollie classic webhook route exists at `/api/hospitality/mollie/payment-webhook`. It accepts only the untrusted `id=tr_...` form body, checks that a private `drinkstock_merchant_payment_attempts` row was previously created by the authorized future commercial order coordinator, then **retrieves** that payment through the **partner-owned Mollie OAuth access**. It checks the live payment's status, profile, merchant order metadata, amount in cents and EUR. Only after this server-side proof is validated does it append one uniquely keyed `payment_verified` event and change the internal order's payment state to `paid`, **retaining `order_state='awaiting_payment'` and setting `fiscal_state='pending'`**.

No unreceipted paid order appears in the bar or waiter queue, and no actual order is promoted to the public TV feed without the existing paid-order state. The venue checkout readiness page displays a fiscal exception count for verified paid orders awaiting a legal receipt. Never mark such a pending order served, manufacture a receipt reference or claim provider issuance from a successful Mollie charge.

The genuine paid-order to legal-receipt bridge **is still missing**. No route or database flag grants a payment intent that could charge guests. A future coordinator must atomically persist an immutable server-locked session/table/price/VAT order snapshot and a Mollie payment attempt before returning the hosted checkout URL. A licensed fiscal provider/FHM/eSEND route must issue and confirm the legal retail receipt, store the provider's verifiable reference, then advance the order to `paid` for bartender preparation. The coordinator must also implement provider-verified failure/cancellation and refunds, PSP/AADE reconciliation and idempotent operational demand.

Activation evidence as of inspection: admin approvals 1, merchant Mollie accounts with verified payment + settlement capability 0, certified retail receipt connections 0, VAT-reviewed drinks 0, paid DrinkStock orders 0. For onboarding: the venue owner must first review products and the applicable jurisdiction, connect **their own** eligible Mollie organization and the proper certified receipt issuer. Until those steps and the missing software are complete, the guest price preview and `checkoutLive:false` remain mandatory.

Official Mollie classic webhook contract (fetch the object by ID; never trust the callback itself): https://docs.mollie.com/reference/webhooks

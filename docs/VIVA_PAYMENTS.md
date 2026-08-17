# Viva.com Smart Checkout — Buy Local Sparta integration runbook

**Build:** 0.37.0  
**Provider:** Viva.com Smart Checkout  
**Architecture:** Buy Local Sparta remains the customer-facing seller; participating local merchants remain suppliers/fulfilment partners.

This document is an engineering runbook, not legal, tax or payment-services advice. Turning `VIVA_PAYMENTS_ENABLED=true` in live production still requires the platform's Viva merchant underwriting, seller/supplier contract, VAT/myDATA flow and customer-facing seller identity to be approved consistently.

## Why standard Smart Checkout, not Marketplace transfers

The current Buy Local Sparta architecture collects one customer payment as the seller of record and creates separate internal supplier procurements/payables. Vendor settlement is therefore intentionally kept in the existing maker/checker supplier-finance workflow rather than automatically splitting the customer card payment to connected seller accounts.

If the legal/accounting model later changes to an intermediary marketplace model, Viva Marketplace/ISV connected-account flows must be evaluated as a separate architecture decision rather than silently mixed into this adapter.

## Viva account prerequisites

Before enabling the adapter in demo or live:

1. Complete the Viva merchant-account/KYB setup for the Buy Local Sparta legal entity.
2. Obtain **Smart Checkout OAuth client credentials** (`Client ID`, `Client Secret`).
3. Obtain **Merchant ID** and **API Key** for classic merchant operations such as refunds and webhook verification.
4. Create/configure a payment source and record its **Source Code**.
5. Configure the payment source redirects:
   - Success URL: `/checkout/success`
   - Failure URL: `/checkout/failure`
6. Configure the webhook URL:
   - `/api/payments/viva/webhook`
7. In Viva's webhook settings, verify that URL and activate at least:
   - Transaction Payment Created — **1796**
   - Transaction Reversal Created — **1797**
   - Transaction Failed — **1798**
8. Use HTTPS for all public production URLs.

The webhook `GET` endpoint implements Viva's verification-key handshake. The `POST` endpoint never trusts a browser redirect or webhook amount alone: payment events are reconciled against Viva's Retrieve Transaction API and the internal order code/currency/amount.

## Environment configuration

```dotenv
VIVA_PAYMENTS_ENABLED=false
VIVA_ENVIRONMENT=demo
VIVA_CLIENT_ID=
VIVA_CLIENT_SECRET=
VIVA_MERCHANT_ID=
VIVA_API_KEY=
VIVA_SOURCE_CODE=
VIVA_PAYMENT_TIMEOUT_SECONDS=900
VIVA_REQUEST_TIMEOUT_MS=10000
BLS_ALLOW_VIVA_DEMO_PREVIEW=false
```

Rules:

- All Viva credentials are **server-only**. Never expose them through `NEXT_PUBLIC_*` variables or client components.
- Production refuses `VIVA_ENVIRONMENT=demo` unless `BLS_ALLOW_VIVA_DEMO_PREVIEW=true` is explicitly set for a controlled preview.
- Real launch should use `VIVA_ENVIRONMENT=live` and should not set the demo-preview override.
- Viva payments require `DATABASE_URL`; the provider adapter is not allowed to run against per-process memory state.

## Payment flow

1. `/api/checkout` creates the internal PostgreSQL customer order and stock reservations.
2. The Viva service commits a unique internal **payment-order creation attempt** before making any provider call.
3. Viva payment-order creation uses OAuth2 and `POST /checkout/v2/orders` with an integer amount in the currency's smallest denomination.
4. The returned 16-digit Viva `orderCode` is persisted as a **string**. The provider JSON parser protects order codes from JavaScript safe-integer rounding.
5. The browser is redirected to Viva Smart Checkout. Buy Local Sparta never collects or stores card PAN/CVC data.
6. The success/failure return pages treat browser parameters as hints only and call Retrieve Transaction before updating order state.
7. A verified successful payment records the Viva transaction UUID, captured amount and provider-verification timestamp, then marks the customer order `confirmed`.
8. Paid stock reservations are protected from generic expiry. The assigned vendor consumes the reservation when accepting the confirmed fulfilment.

### Distributed idempotency rule

Viva payment-order creation is an external side effect and is not part of the PostgreSQL transaction. To prevent duplicate provider orders across crashes/retries:

- BLS first persists `orderCreationState=creating` plus a unique correlation/attempt ID.
- Only that attempt is allowed to call Viva.
- The returned order code is persisted in a second transaction.
- A concurrent instance reuses an existing provider order code.
- If the provider/network outcome is uncertain, the attempt becomes `manual_review` and **automatic retry is blocked**.
- The durable worker promotes stale `creating` attempts to `manual_review` rather than guessing whether Viva created an order.

This is deliberately conservative because external payment-order creation cannot be made transactionally atomic with PostgreSQL.

## Webhook and redirect reconciliation

The adapter handles:

- **1796** — successful payment
- **1798** — failed payment; treated as non-final because the customer may retry and later succeed
- **1797** — successful reversal/refund

Payment status updates are monotonic. Old/out-of-order `pending`, `failed` or successful-payment webhooks cannot regress a payment that is already captured, refunded or in chargeback state.

For successful payments BLS verifies:

- Viva order code matches the persisted provider order code
- transaction ID is authoritative
- currency is EUR / ISO numeric 978
- provider amount equals the authoritative internal order total

Create-order amounts and refund-request amounts use **minor units**. Retrieve Transaction and webhook currency amounts are normalized to integer minor units before comparison/accounting.

## Refunds and cancellations

Customer/order cancellation is orchestrated in this order:

1. If no payment was captured but a Viva payment order exists, cancel the Viva payment order first.
2. If money was captured, create/reuse the durable BLS refund intent.
3. Execute the Viva refund against the original transaction.
4. Only after a definitive successful refund may the customer-order cancellation complete.
5. After cancellation, active reservations are released; reservations already consumed by vendor acceptance are restored through an idempotent `cancellation_restore` inventory movement.

Approved platform return refunds use the same Viva refund service and then update return/order-line accounting.

### Refund uncertainty

The refund API has an external side effect. BLS therefore never blindly retries an ambiguous request:

- durable refund row starts as `processing`
- definitive provider rejection → `failed`
- successful provider reversal with a provider transaction ID → `completed`
- timeout/network/unknown outcome → `manual_review`
- stale `processing` rows are promoted to `manual_review` by the worker
- the same BLS refund idempotency key cannot automatically issue a second refund
- the later 1797 reversal webhook uses the provider reversal transaction ID as a dedupe identity, preventing double accounting after a synchronous API success

Admin Operations reports Viva payment/refund items requiring manual reconciliation as a degraded non-critical health check. Explicitly failed refunds are surfaced there as well.

### Capture-after-cancellation race

A provider capture can race with a customer cancellation even when BLS cancels the unpaid Viva payment order first. If authoritative reconciliation later reports a successful capture while the internal order is already `cancelled`, BLS creates one full refund using the stable key `late-capture:<orderId>`. A completed refund changes the payment back to `refunded`. An unknown refund outcome is persisted as `manual_review` and the webhook is acknowledged instead of causing a redelivery/refund loop.

## Provider endpoints used by the adapter

Demo and production hosts are selected by `VIVA_ENVIRONMENT`.

- OAuth token: `POST /connect/token` on the Viva accounts host
- Create payment order: `POST /checkout/v2/orders`
- Retrieve transaction: `GET /checkout/v2/transactions/{transactionId}`
- Smart Checkout browser URL: `/web/checkout?ref={orderCode}`
- Refund/cancel transaction: `DELETE /api/transactions/{transactionId}/?...`
- Cancel unpaid payment order: `PATCH /api/orders/{orderCode}`
- Webhook verification key: `GET /api/messages/config/token`

## Current automated proof

Local dependency-free proof:

- provider OAuth token reuse
- payment-order request uses minor units
- 16-digit provider order code survives JSON parsing without JS rounding
- Retrieve Transaction decimal amount normalization
- refund request uses minor units + merchant Basic auth
- current payment-order cancellation method
- webhook JSON validation

Configured live PostgreSQL CI proof uses a deterministic fake Viva gateway against the **real database service layer** and verifies:

- two application instances create/reuse one persisted provider order
- verified provider capture confirms the customer order
- paid reservations survive generic reservation expiry
- vendor acceptance consumes the paid reservation exactly once
- captured cancellation executes one refund and restores consumed inventory
- reversal-webhook redelivery cannot double-count the refund
- out-of-order original success events cannot regress a refunded payment
- a late provider capture after internal cancellation executes exactly one full refund and remains idempotent on reconciliation redelivery

The fake gateway is intentionally used in CI so tests never move real money. A separate controlled Viva demo-account smoke is required before live activation.

## Go-live checklist

- [ ] Viva merchant/KYB approval complete for the Buy Local Sparta legal entity.
- [ ] Accountant/legal counsel confirms seller-of-record, VAT/myDATA, supplier invoice and refund treatment.
- [ ] Live Smart Checkout client credentials stored in the deployment secret manager.
- [ ] Live Merchant ID/API Key stored in the deployment secret manager.
- [ ] Correct Viva payment source and source code configured.
- [ ] Success/failure URLs point to the production HTTPS domain.
- [ ] Webhook URL verifies successfully in Viva and events 1796/1797/1798 are active.
- [ ] `DATABASE_URL` points to the production PostgreSQL 18/PostGIS schema at migration 31.
- [ ] `VIVA_ENVIRONMENT=live`; demo-preview override disabled.
- [ ] Run `npm run check:release` in Node 24 CI.
- [ ] Run `npm run check:postgres` against the deployment database.
- [ ] Perform controlled Viva **demo** end-to-end tests: success, failure/retry, customer cancel before payment, full refund, partial return refund, webhook redelivery.
- [ ] Perform a low-value controlled **live** transaction only after underwriting/legal/accounting sign-off.
- [ ] Confirm payment descriptor/customer support text identifies Buy Local Sparta consistently as seller.
- [ ] Configure operational alerting for readiness failure and `manual_review` payment/refund states.
- [ ] Reconcile first live transactions against Viva portal, BLS payment ledger and bank settlement before broader launch.

## Official Viva references

- https://developer.viva.com/integration-reference/oauth2-authentication/
- https://developer.viva.com/tutorials/payments/create-a-payment-order/
- https://developer.viva.com/tutorials/payments/verify-a-payment/
- https://developer.viva.com/code-samples-for-payments/retrieve-transaction/
- https://developer.viva.com/tutorials/payments/issue-a-refund/
- https://developer.viva.com/webhooks-for-payments/
- https://developer.viva.com/webhooks-for-payments/transaction-payment-created/
- https://developer.viva.com/webhooks-for-payments/transaction-reversal-created/

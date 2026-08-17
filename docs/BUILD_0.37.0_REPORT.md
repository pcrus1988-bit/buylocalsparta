# Buy Local Sparta — Build 0.37.0 Report

**Release:** 0.37.0  
**Focus:** Viva.com Smart Checkout payment-provider preparation and payment-state hardening  
**Date:** 17 August 2026

## Executive summary

Build 0.37.0 adds the prepared production payment-provider connection for Buy Local Sparta using **Viva.com Smart Checkout**. The adapter is integrated with the PostgreSQL customer-commerce runtime and preserves the platform's seller-of-record architecture: Buy Local Sparta receives the customer payment, while participating shops remain suppliers/fulfilment partners and continue to be paid through the existing supplier procurement/payable maker-checker workflow.

The implementation deliberately does not collect or store card PAN/CVC data. Checkout creates the internal order and reservations first, then creates or reuses a Viva payment order and redirects the browser to Viva-hosted Smart Checkout. Browser redirects and webhook payloads are not treated as sufficient proof of payment; authoritative transaction retrieval is used before internal money/order state changes.

No live Viva credentials are contained in this build and no real-money transaction was executed in this local environment. Production activation remains gated on Viva merchant approval/KYB, production credentials/payment-source/webhook configuration, legal/accounting confirmation of the seller-of-record model, and controlled demo/live evidence.

## Provider architecture

### Selected flow

- Buy Local Sparta: customer-facing seller / merchant receiving the Smart Checkout payment.
- Viva.com: licensed payment/acquiring provider and hosted checkout surface.
- Local merchants: suppliers/fulfilment partners, not automatically connected payout recipients in this adapter.
- Vendor settlement: existing BLS supplier procurement/payable/settlement maker-checker flow.

This avoids silently mixing the existing seller-of-record architecture with a connected-account Marketplace/ISV transfer model.

### Provider package

New workspace: `packages/viva-payments`

The provider client implements:

- demo/live environment selection;
- OAuth2 access-token acquisition and token caching;
- `POST /checkout/v2/orders` payment-order creation;
- Smart Checkout redirect URL creation;
- `GET /checkout/v2/transactions/{transactionId}` retrieval;
- full/partial refund calls against the original transaction;
- unpaid payment-order cancellation;
- webhook verification-key retrieval;
- bounded request timeouts;
- conversion between Viva currency amounts and BLS integer minor units;
- preservation of 16-digit Viva `orderCode` values as strings before JavaScript JSON number parsing can round them.

## PostgreSQL payment orchestration

New service: `PostgresVivaPaymentsService`.

### Payment-order creation

Provider-order creation uses a conservative two-phase state machine because the external Viva request cannot be atomically committed with PostgreSQL:

1. Validate customer/order ownership and authoritative order total.
2. Persist a unique provider creation-attempt/correlation ID with `orderCreationState=creating`.
3. Commit that marker before contacting Viva.
4. Call Viva once for that attempt.
5. Persist the returned 16-digit provider order code in a second transaction.
6. Concurrent application instances reuse an already persisted order code.
7. If the network/provider outcome is uncertain, mark the attempt `manual_review` and block automatic retries.
8. The durable worker promotes stale `creating` attempts to `manual_review` rather than guessing whether Viva created an order.

This protects against duplicate payment orders after crashes, timeouts or cross-instance retries.

### Payment confirmation

Successful payment confirmation is authoritative only after Retrieve Transaction reconciliation verifies:

- persisted Viva order code;
- transaction UUID;
- EUR currency / ISO numeric 978;
- provider amount equals the authoritative BLS order total.

A verified capture:

- persists the provider transaction reference;
- records verified provider payload/status;
- moves the internal payment to captured state;
- confirms the customer order;
- protects the paid stock reservation from generic expiry.

The assigned Vendor consumes the reservation only when accepting the payment-confirmed fulfilment.

### Monotonic payment state

Delayed or duplicate provider events cannot regress final money state. In particular:

- a failed attempt is non-final and may later be followed by success;
- old failed/pending events do not overwrite captured/refunded/chargeback state;
- a repeated original successful-payment event after a completed refund does not return the payment to `captured`;
- reversal events use the provider reversal transaction identity for deduplication.

## Web checkout and routes

Production PostgreSQL checkout now fails closed unless Viva is configured.

Implemented surfaces:

- `/api/checkout` — internal checkout followed by Viva payment-order initiation;
- `/checkout/success` — verifies `t`/`s` with Retrieve Transaction before showing confirmed payment and clearing the browser cart;
- `/checkout/failure` — advisory failure surface that still reconciles provider state when identifiers are available and preserves the cart otherwise;
- `/api/payments/viva/webhook` — Viva verification-key GET handshake plus webhook POST processing.

No client component receives Viva secrets, Merchant ID/API Key or OAuth credentials.

## Webhooks

The prepared webhook route handles the core payment events used by this integration:

- **1796** Transaction Payment Created;
- **1797** Transaction Reversal Created;
- **1798** Transaction Failed.

1796/1798 events trigger authoritative transaction retrieval rather than trusting the webhook's monetary fields alone. 1797 reversal events are reconciled against the original provider transaction and are deduplicated by the reversal transaction ID.

## Refunds and cancellation

Refunds are durable BLS objects with a stable application-level idempotency key.

### Definitive success

A successful Viva refund must include a provider reversal transaction ID. BLS records it, updates refunded/captured totals and changes payment status to `partially_refunded` or `refunded`.

### Provider rejection

A definitive provider rejection becomes `failed` and is surfaced in Admin payment health.

### Unknown outcome

Timeout/network/ambiguous provider outcome becomes `manual_review`. BLS does not blindly retry the provider call. The worker also promotes stale `processing` rows into manual reconciliation.

### Cancellation ordering

For an unpaid order with a Viva payment order, BLS cancels the Viva payment order before internal customer-order cancellation.

For a captured order, BLS executes/reconciles the required refund before completing internal cancellation. Stock reservations are released; stock already consumed by Vendor acceptance is restored through the existing idempotent cancellation inventory movement.

### Capture-after-cancellation race

Build 0.37 closes the provider race where a successful capture may arrive after BLS has already cancelled the unpaid order.

If authoritative reconciliation sees `order=cancelled` and `payment=captured`, BLS issues one full refund using the stable key:

`late-capture:<orderId>`

A successful refund returns the payment to `refunded`. An uncertain outcome is persisted for manual reconciliation. The payment webhook is not forced into an endless retry/refund loop, and repeated reconciliation cannot issue a second provider refund for the same key.

## Return refunds

Approved platform return refunds route through the same Viva refund orchestration and calculate the exact customer refundable value using the authoritative line price and proportional discount allocation.

The direct PostgreSQL Admin return-refund mutation remains fail-closed so a database status cannot falsely claim that customer money moved without the provider adapter.

## Migration 0031

New immutable migration: `0031_viva_payments.sql`.

It adds durable provider/reconciliation metadata including:

- provider order code;
- provider transaction ID;
- provider correlation/verification data;
- provider payload state;
- refund provider status/event/failure metadata;
- supporting uniqueness/indexing for provider reconciliation.

The migration also protects active reservations belonging to payment-confirmed orders from generic stock-reservation expiry.

Current schema count: **31 migrations**.

## Operational readiness

### Environment variables

The deployment template now includes:

- `VIVA_PAYMENTS_ENABLED`
- `VIVA_ENVIRONMENT`
- `VIVA_CLIENT_ID`
- `VIVA_CLIENT_SECRET`
- `VIVA_MERCHANT_ID`
- `VIVA_API_KEY`
- `VIVA_SOURCE_CODE`
- `VIVA_PAYMENT_TIMEOUT_SECONDS`
- `VIVA_REQUEST_TIMEOUT_MS`
- `BLS_ALLOW_VIVA_DEMO_PREVIEW`

The integration requires `DATABASE_URL`; provider money state is never allowed to run on per-process memory state.

### Readiness and Admin health

Readiness validates that required database/Viva configuration is present when payments are enabled.

Admin operational health degrades when:

- Viva payment-order creation requires manual review;
- refunds require manual review;
- refunds have definitively failed and need operational attention.

### Durable worker

The PostgreSQL worker watches for stale:

- Viva payment-order creation attempts;
- refund attempts whose provider outcome is still unknown.

These are moved to manual reconciliation rather than retried automatically.

## CI and automated proof

### Local release checks completed

- **209 / 209 Core tests passed**.
- **7 / 7 Viva provider tests passed**.
- **31 / 31 migration checksum/integrity checks passed**.
- Project consistency/security/PostgreSQL/Viva gate passed.
- 4 / 4 development UI syntax checks passed.
- 6 / 6 structural accessibility checks passed.
- Complete HTTP marketplace smoke journey passed.
- Strict Core TypeScript passed.
- Strict Viva provider TypeScript passed.
- Strict PostgreSQL-runtime TypeScript passed.
- Semantic NodeNext live-DB smoke TypeScript passed.
- **143** production web/PostgreSQL runtime/Viva-provider TS/TSX source files parsed with zero errors.
- **0** missing relative imports in that source scan.

### Live PostgreSQL CI proof prepared

The database integration smoke uses two independent runtime facades and a deterministic fake Viva gateway over the real PostgreSQL service layer. It is configured to prove:

- one provider order across two application instances;
- verified payment confirmation;
- paid reservation protection;
- Vendor acceptance consumes stock exactly once;
- captured cancellation executes one provider refund;
- cancellation restores already-consumed inventory;
- reversal webhook redelivery cannot double-count a synchronously recorded refund;
- out-of-order original success cannot regress refunded state;
- late capture after cancellation triggers exactly one automatic full refund;
- repeated late-capture reconciliation does not send a second refund.

The fake gateway deliberately prevents CI from moving real money.

## What was not executed locally

This local execution environment does not provide a PostgreSQL/PostGIS server and does not contain the complete installable Next/React dependency tree. Therefore this report does **not** claim:

- a local live PostgreSQL integration run;
- a genuine Node 24 `next build`;
- a network request using real Viva demo/live merchant credentials;
- a real card/payment/refund transaction.

Those remain configured CI/deployment and merchant-credential gates.

## Viva portal / deployment configuration still required

1. Complete/confirm Viva merchant underwriting and KYB for the Buy Local Sparta legal entity.
2. Obtain Smart Checkout OAuth Client ID/Client Secret.
3. Obtain Merchant ID/API Key required by the prepared merchant operations.
4. Create/confirm the BLS payment source and Source Code.
5. Configure production HTTPS Success URL to `/checkout/success`.
6. Configure production HTTPS Failure URL to `/checkout/failure`.
7. Configure and verify `/api/payments/viva/webhook`.
8. Enable required payment/reversal/failure webhook events.
9. Store all credentials in the deployment secret manager; never `NEXT_PUBLIC_*`.
10. Apply all 31 migrations and pass database readiness/smoke.
11. Run the Node 24 production CI build.
12. Run controlled Viva demo tests: success, failed-then-success retry, pre-payment cancel, full refund, partial return refund, webhook redelivery and cancellation/capture race.
13. Perform a low-value live transaction only after payment underwriting and legal/accounting sign-off.
14. Reconcile the first live transactions across Viva, BLS internal payment ledger and bank settlement before broader launch.

## Accounting / seller boundary

This adapter does **not** convert Buy Local Sparta into a pass-through marketplace payout model. The internal supplier procurement, supplier invoice, payable approval and settlement maker/checker model remains separate from customer payment acquiring.

If the legal structure later changes, connected-account/Marketplace transfers should be evaluated as a separate architecture change with corresponding contract, VAT, accounting and payment-services review.

## Official provider references used

- https://developer.viva.com/smart-checkout/smart-checkout-integration/
- https://developer.viva.com/tutorials/payments/create-a-payment-order/
- https://developer.viva.com/tutorials/payments/verify-a-payment/
- https://developer.viva.com/tutorials/payments/issue-a-refund/
- https://developer.viva.com/webhooks-for-payments/
- https://developer.viva.com/webhooks-for-payments/transaction-payment-created/
- https://developer.viva.com/webhooks-for-payments/transaction-reversal-created/

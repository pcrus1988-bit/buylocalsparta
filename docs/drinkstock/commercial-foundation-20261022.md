# DrinkStock commercial foundation — 22 October 2026

## Implemented in this change

- `persistDrinkStockOrderSnapshot` resolves the table token on the server, checks
  active partner/app/venue and fallback entitlement, rechecks pass revocation,
  locks the session, verified standard dine-in tax context and selected drinks,
  validates current prices and the 15-second quote, then writes the unpaid order,
  lines, immutable VAT/net/gross snapshot and audit event in one transaction.
- One venue/request UUID produces one order and one durable PSP request UUID.
  Identical retries return the original snapshot even after quote expiry; a
  different cart, quote or table using the same request UUID is rejected.
- The new ledger is server-only, RLS enabled, with browser grants revoked and
  database triggers refusing snapshot updates/deletes. No table token is stored
  in the ledger. The additive operation changes no existing business rows.
- Merchant Mollie refund transport first retrieves the exact live parent payment,
  checks profile/order/EUR/amount, then creates or retrieves the refund using its
  persisted idempotency key and validates refund/payment/order/amount correlation.
  Queued, pending and processing refunds do not mean money has been returned.
  Timeout/5xx outcomes remain unknown and must retain the original request key.
- Payment creation now rejects test-mode, terminal and mismatched responses and
  checkout URLs with unexpected ports. Transport imports no longer initialize
  database/AADE clients just to validate provider payloads.

## Integration boundaries still outstanding

This is an internal order persistence adapter and refund protocol layer, **not a
released guest checkout**. No guest route is mounted and no provider capability
flag is enabled by this change. A caller must not return the internal snapshot as
permission to charge a customer. The fiscal/refund workflow remains incomplete.

1. Apply `db/operations/20261022_drinkstock_checkout_intents.sql` after the existing
   foundation, fallback, VAT catalogue and venue tax context operations. Verify a
   restorable production backup before production schema work. This PR does not
   execute any production database changes.
2. Configure a verified settlement destination. The deployed web project's
   environment inventory currently includes the marketplace Mollie settings but
   no `DRINKSTOCK_MOLLIE_CONNECT_CLIENT_ID`,
   `DRINKSTOCK_MOLLIE_CONNECT_CLIENT_SECRET` or
   `DRINKSTOCK_MOLLIE_OAUTH_REDIRECT_URI`. Marketplace collection can only be reused
   with an implemented and provider-authorized merchant routing arrangement;
   possession of the platform API key is not that arrangement. The existing
   connected-merchant transport is an alternative already present in the code.
3. Identify and connect the actual retail fiscal issuer and its credit-document
   API. AADE reporting connectivity and FISCAL draft APIs are not implemented
   retail receipt/credit transports. Do not create placeholder provider IDs.
4. Implement the durable payment job that consumes the persisted payment request
   UUID, rechecks release/merchant/fiscal readiness, creates the payment outside
   the order transaction, and saves its correlation before exposing a hosted URL.
   A crash between provider creation and local linkage must recover using the
   same request UUID; a new key can create duplicate charges.
5. Reserve refund amounts under the order lock before using the refund transport,
   retain ambiguous outcomes, reconcile provider status and issue the matching
   verified fiscal credit. The transport itself grants no refund authority.
6. Record both drink VAT reviews and the venue jurisdiction from actual merchant
   facts. Those facts are not inferred or attested by the implementation.
7. Verify paid → fiscal issue → bar/waiter dispatch, cancellation, refund/credit,
   market demand exactly once and provider outage recovery before activating a
   guest route or changing `checkoutLive` / capability flags.

## Validation

`npm run test:drinkstock-commercial` exercises VAT preparation, payment protocol,
refund transport, transaction rollback, changed prices, expired quotes, revoked
passes, paused sessions and retry conflicts with local test doubles.

`npm run test:drinkstock-commercial:postgres` uses
`DRINKSTOCK_TEST_DATABASE_URL` and refuses remote hosts or any database not named
`drinkstock_test` / `drinkstock_test_*`. The GitHub workflow supplies a disposable
PostgreSQL 17 service and validates actual SQL, concurrent requests, constraints,
immutable ledger behavior and browser-role denial. It never reads production
credentials or writes to a production database. Local runs without this variable
skip the PostgreSQL test; do not count that skip as a passed integration check.

Official Mollie contracts:
- https://docs.mollie.com/reference/create-refund
- https://docs.mollie.com/reference/get-refund
- https://docs.mollie.com/reference/api-idempotency

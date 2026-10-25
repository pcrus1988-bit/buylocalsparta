> **SUPERSEDED FOR THE ADMIN-APPROVED POS-UNAVAILABLE FALLBACK (20 October 2026):**
> Per the operator's explicit decision, fallback now reuses KONTA MOY's existing Mollie and AADE backend integrations, not separate partner credentials or OAuth onboarding. Partner OAuth endpoints are disabled by default and hidden from the fallback UI. See [the shared-platform fallback contract](./platform-mollie-aade-fallback-20261020.md). This earlier document remains historical implementation reference only.
>
# DrinkStock Merchant Mollie + AADE Integration — 20 October 2026

## Decision

For a hospitality venue acting as seller of record, use **Mollie Connect for Platforms** with a separate merchant organization, not the KONTA MOY marketplace Mollie API key. The merchant receives settlement; the marketplace does not assume ownership of the payment. Mollie docs:
- https://docs.mollie.com/docs/connect-process-payments
- https://docs.mollie.com/docs/connect-overview
- https://docs.mollie.com/docs/connect-manage-merchants

For the venue's Greek invoices/receipts, store **its own AFM and AADE myDATA credentials**, separate from KONTA MOY's AADE credentials. A successful myDATA read-only connectivity check is **not legal certification or issuance of a retail receipt**. Retail invoices transmitted via FHM/eSEND and licensed electronic invoicing providers have separate issuance and reporting processes. Official AADE:
- https://aade.gr/teleytaia-nea-mydata/odigies-heirismoy-diasyndesis-esend-mydata
- https://www.aade.gr/mydata/parohoi-ypiresion-ilektronikis-timologisis
- https://www.aade.gr/mydata/tehnikes-prodiagrafes-ekdoseis-mydata

## Implemented
- Self-service merchant OAuth start/callback: 10-minute single-use random state, owner-only partner scope, verified merchant identity, Mollie payments and settlements capabilities, encrypted refresh credentials in Supabase Vault.
- Self-service merchant AADE setup: owner CSRF, 9-digit AFM checksum, independently encrypted Vault credentials, read-only ERP RequestTransmittedDocs probe, opaque connectivity result; does not invoke SendInvoices.
- Merchant payment API transport contract: create with EUR cents, merchant profile, order ID, native Mollie idempotency key; retrieve server-to-server; reconcile only if live paid, correct profile, exact EUR amount and order metadata.
- Human-readable dashboard at `/drinkStock/dashboard/<partnerId>/payments`, linked from partner workspace and checkout readiness.
- All connections are server-owned, with RLS deny-by-default. No shared marketplace secret is loaded by the merchant connector.

## Required external configuration
Create a Mollie OAuth application under **Mollie → Developers → Your apps**, with callback:

`https://hospitality.kontamou.site/api/hospitality/mollie/callback`

Add **production server-only** secrets:
- `DRINKSTOCK_MOLLIE_CONNECT_CLIENT_ID` (app_…)
- `DRINKSTOCK_MOLLIE_CONNECT_CLIENT_SECRET` (never NEXT_PUBLIC_)
- `DRINKSTOCK_MOLLIE_OAUTH_REDIRECT_URI` exactly as callback above.

Partner must independently authorize Mollie through the dashboard, complete KYB, and enable payment and settlement capabilities. A single verified website profile is selected automatically; zero/multiple verified profiles require later explicit review rather than silently guessing.

Merchant AADE user ID/subscription key are entered by an authorized merchant owner and kept in Supabase Vault; no AADE access details are returned to browsers.

## Not authorized / not yet implemented
- No guest order charge: `DRINKSTOCK_COMMERCIAL_PAYMENTS_ENABLED` remains absent/false. The PSP transport is not connected to any public guest POST route. Its required fiscal/order release evidence cannot be supplied by a browser.
- No commercial order persistence/webhook transaction reconciliation, refund/credit document creation, merchant-specific certified receipt issuance, or production financial activation in this branch.
- The AADE reporting connection cannot turn `receipt_issuance_verified` to true and cannot override the existing checkout readiness false gates.
- A separate signed/certified fiscal receipt adapter and atomic DB ledger must be delivered, reviewed and reconciled before enabling paid orders.

## QA and release
- Apply additive `db/operations/20261020_drinkstock_merchant_mollie_aade_connections.sql`; verify RLS, no anon/authenticated grants, empty connection tables.
- Build/acceptance/Chromium pass; Vercel Preview READY; merge; then verify production deployment.
- Test OAuth merchant consent with a real connected merchant account before attempting any live PSP API call.

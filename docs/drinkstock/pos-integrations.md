# DrinkStock POS integration — provider-neutral contract (2026-10-19)

## Status
This change introduces **only** a provider-neutral type/validation contract and
fail-closed trade eligibility helper. **No merchant POS is connected.**
It adds no order ingestion route, no payment events, no fiscal documents, no
database writes and no production enablement. The operational checkout and
actual paid-order TV feed retain their existing commercial safety gates.

## Integration boundary
A bar's **hospitality POS/cash-register software** holds menu items, checks
and sales. A **payment terminal** can often start a card payment and report its
outcome but is not a substitute for an item-level POS sales integration.

    Existing POS     -> adapter (verified events) -> normalized sale
    DrinkStock QR    -> accepted order -> adapter (when supported) -> POS ticket
    POS/PSP          -> independently verified payment/settlement
    Fiscal provider  -> lawful venue-issued receipt/credit note
    DrinkStock       -> priced market + guest quote + venue screen

DrinkStock uses a single partner/venue/session-scoped product map and canonical
session pricing model; it must never trust a caller-supplied tenant, price or
payment-success flag.

## Adapter capabilities (discover per merchant/provider)
- `catalog_read`: fetch active drink list and option identifiers
- `sales_read`: read item-level settled/final sales (or approved webhooks)
- `order_write`: place DrinkStock QR orders in venue POS (outbound)
- `price_write`: update menu item prices, only if supported and approved
- `payment_status`: separately verify final payment/capture state
- `refunds_read`: reconcile reversals and partial refunds
- `inventory_read`, `fulfilment_write`: optional stock/service updates

Two modes: **observe-only** (read genuine POS paid sales and affect the
DrinkStock market, but do not claim to change what the POS charges) and
**two-way** (requires explicit approved order/price writes, per venue).
Unsupported capabilities stay disabled; no silently simulated fallback.

## Provider investigation and priorities
1. **Square**: order/catalog/inventory APIs and order-update webhook;
   verify regional merchant availability and POS-origin event semantics.
   Docs: https://developer.squareup.com/docs/orders-api/what-it-does
2. **Lightspeed Restaurant K**: OAuth-backed orders/items APIs; only
   approved merchants/partners can access; apply for integration.
   Docs: https://api-portal.lsk.lightspeed.app/quick-start/intro
3. **Toast**: menu/order APIs; ordinary Standard API Access is read-only;
   write/partner integration needs separate approval.
   Docs: https://doc.toasttab.com/doc/devguide/apiOverview.html
4. **SOFT1/ENTERSOFTONE**: web-services-based Greek ERP integration;
   confirm each deployed restaurant system's model, licensing and
   available itemized sales operations.
   Docs: https://www.softone.gr/ws/
5. **Viva.com**: Cloud/Local Terminal APIs for **payment terminal
   operations**, not a claim to read the bar's items/checks.
   Docs: https://developer.viva.com/apis-for-point-of-sale/card-terminals-devices/rest-api/
6. Other closed systems: vendor-certified local connector/bridge if
   contractually allowed; poll only when compliant with vendor API policy.

## Mandatory controls before a real adapter can be activated
1. Store a per-venue `pos_connection` with provider, external merchant and
   location mapping, capabilities, enabled state, consent, encrypted secret
   reference, webhook configuration and health status. Strict partner/venue
   RLS and server-side authorization.
2. **Validate webhook origin/signature** according to each provider's real
   security scheme and independently retrieve/reconcile the final sale.
   No generic unauthenticated `POST /pos/sales` endpoint.
3. Bind external location IDs to the configured venue on the server, never
   take partner/venue/session IDs from external payload.
4. Map each POS external SKU/variation to a venue-owned DrinkStock product.
   Unmapped items are quarantined, not guessed. Preserve the sale's immutable
   integer-cent amounts, currency, timestamp and source payment status.
5. Persist append-only normalized events in a transaction with a **unique
   (connection_id, source_event_id)** constraint, provider order references
   and a reconciliation ledger. Rows with same order but different updates
   cannot independently increment market demand twice.
6. Only finalized provider-confirmed **paid** sales from a currently active
   session may influence actual DrinkStock demand. Process voids/refunds as
   adjustments; never delete historical sales or invent new purchases.
   Account for asynchronous delayed events and cross-session boundaries.
7. Prevent pricing feedback loops: mark DrinkStock-origin orders, distinguish
   externally accepted tickets, do not re-issue a sale to its source POS.
   Snapshot a displayed price at checkout; if provider-calculated totals
   differ, seek customer reconfirmation rather than silently charging.
8. For write-enabled POS connectors, test vendor price-write capabilities,
   rollback, stale price conflicts and venue-wide floors/ceilings. In
   observe-only mode, do not show POS cashier prices as synchronized.
9. The **actual TV feed** currently reads DrinkStock paid orders plus genuine
   `payment_verified` evidence. Importing POS payments requires a reviewed
   reconciled ingestion path that preserves this same rule; never fake
   `payment_verified` events to light up the display.
10. Greek venue seller-of-record, applicable VAT and AADE-compliant fiscal
    issuance remain separately governed. Terminal settlement is not a fiscal
    receipt. Use receipt/credit reconciliation and merchant approval.

## Suggested next implementation increments
A. Add tenant-scoped POS connections, merchant location and SKU mappings;
   encrypted secret references and connection self-test UI.
B. Build one **observe-only** real provider adapter and signature validation
   with sandbox fixtures and de-duplication tests. Reconcile item-level paid
   sales without changing guest checkout.
C. Build a market ingestion transaction and audit replay/partial-refund logic.
D. Add two-way POS ticket export only where vendor APIs support it.
E. Add verified payments, receipts and refunds; separately enable QR checkout
   after finance and tax compliance gates.
F. Owner screen: connection health, last sync, unmapped drinks, dead-letter
   queue, reconciliation and emergency disconnect.

If the POS does not expose a supported integration interface, a partner-
approved local bridge can be considered. Do **not** reverse-engineer private
protocols or interfere with the Greek tax/POS integration path.

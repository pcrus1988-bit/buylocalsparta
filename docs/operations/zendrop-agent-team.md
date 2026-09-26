# Zendrop integration team

This file coordinates the five bounded Zendrop workstreams created on 2026-09-26.

1. **Agent 1 — Connection & Shopify bridge health** — #1026
2. **Agent 2 — Continuous catalogue ingestion / no localization gate** — #1027
3. **Agent 3 — Taxonomy, canonicalization & 25% pricing** — #1028
4. **Agent 4 — Shopify provisioning, authoritative stock & publication** — #1029
5. **Agent 5 — Deployment, checkout & order relay safety** — #1030

## Shared invariants

- KONTA MOY remains the customer-facing storefront and seller workflow.
- The hidden Shopify store is infrastructure for Zendrop product/stock/order bridging only.
- Greek localization is not a publication prerequisite.
- Shopify bridge inventory is authoritative for mapped Zendrop variants.
- Zendrop pricing uses the governed 25% product-cost markup rule with the existing minimum contribution, Greece shipping, VAT and transaction protection.
- Order forwarding and auto-fulfillment remain disabled until the continuous catalogue/publishing path is green and a separate controlled fulfillment test is approved.
- Supplier identity must not be exposed publicly.

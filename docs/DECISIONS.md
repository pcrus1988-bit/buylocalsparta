# Blueprint 1.1 — Implementation Decisions

This file turns Blueprint v1.0 section 26 into explicit implementation status so development can proceed without silently resolving commercial/legal ambiguity.

| Decision | Status for build | Implementation default | Production gate |
|---|---|---|---|
| Legal form of supply | **Approved as product architecture; legally pending** | Buy Local Sparta sells to customer and buys just-in-time from assigned local supplier | Greek ecommerce lawyer + accountant + PSP written confirmation |
| Retail pricing | **Approved** | One platform retail price per market/canonical variant; supplier purchase prices remain private | Commercial cost schedules must be signed |
| Founding €1,500 VAT/pass-through | **Provisional** | €1,500 planning price for a 36-month entitlement; 0 sales-service-fee snapshot; third-party/pass-through excluded where contracted; VAT presentation configurable | Accountant + final merchant terms |
| Standard plans | **Draft configuration** | A generic Standard plan is seeded as draft with no public price. Earlier business-plan Local/Growth/Pro figures remain research assumptions until explicitly approved | Business owner approval |
| Payout timing | **Provisional** | After delivery, weekly settlement batches with risk hold/offset controls | Finance + PSP |
| Return destination | **Approved architecture** | Rules engine; simple withdrawals can route to vendor, disputes/safety to platform/inspector | Operations/legal policy |
| Local consolidated delivery | **Deferred** | Pickup/direct ship first | Volume proof |
| Advice compensation | **Approved architecture** | Advice included in supplier relationship; 30-day attribution | Commercial policy for no-order consultations |
| Reviews | **Approved architecture** | Verified order or verified advice interaction only; interaction type shown | Legal/product copy review |
| Initial categories | **Approved** | Launch clean non-regulated categories first; regulated categories gated | Compliance sign-off per category |

## Source precedence used for implementation

1. Explicit user direction in the MASTER BUILD PROMPT.
2. Product & Technical Blueprint v1.0 for detailed product/technical behaviour.
3. Business Plan + financial workbook for commercial assumptions, market data and go-to-market inputs.
4. Where sources conflict on legal/commercial structure, implementation remains configurable or gated rather than silently assuming certainty.

## Analytics privacy and fairness boundary — Build 0.12

Analytics is an observability and product-demand domain, not a ranking input. Search, product, cart, checkout, advice, appointment and Ask Local outcomes may be measured, but those measurements never modify Fair Vendor Exposure deficits, capacity weights or hidden eligibility. Different merchant conversion rates therefore remain a coaching/content signal rather than a reason to secretly reduce organic exposure.

The analytics identity boundary is deliberately minimized. Browser/visitor context is converted to a namespaced one-way SHA-256 hash before an analytics event exists, common email/Greek-phone patterns are redacted from search text, and financial values remain integer minor units. PostgreSQL raw behavior events are platform-only under RLS and have an explicit retention deadline. Search-demand and market rollups are platform operational data; vendors receive only aggregate rows for their own vendor ID.

Vendor analytics access is separate from marketplace analytics access. Vendor owners/finance may see their own aggregate performance; catalog-only or fulfilment-only vendor staff do not automatically receive attributed sales data. Platform roles receive market intelligence only when granted `analytics.market.read`. No API returns competitor-level vendor analytics to merchants.


## Security/availability defaults — Build 0.14

The development runtime uses fixed-window in-process rate limiting only as the executable policy implementation. Production must preserve the route budgets/error semantics behind a distributed Redis/edge implementation; client forwarding headers are ignored unless `TRUST_PROXY=true` is explicitly configured. Security evidence uses hashed correlation identifiers and sanitized metadata with a 90-day default retention, not raw IP/email/token storage.

Readiness and liveness are intentionally separate. Optional provider failure must remain visible without unnecessarily removing the storefront from service, while a failed critical commerce/search dependency must fail readiness. The current development CSP still permits inline script/style because the dependency-free interface is generated inline; the production Next.js build must replace unnecessary `unsafe-inline` allowances with nonces/hashes before launch.


## Consumer remedy and supplier-recovery boundary — Build 0.16

The platform's consumer obligation is deliberately decoupled from whether a supplier invoice or payout has already been settled. Once a customer remedy is approved, Buy Local Sparta may refund/replace/repair according to the consumer workflow without first recovering money from the local supplier. Mutating or reopening an already-paid settlement batch would weaken reconciliation and auditability, so a return after settlement creates a separate supplier receivable/post-settlement recovery record and balanced ledger event. The exact B2B credit-note, VAT and collection/netting treatment of that receivable remains configurable and requires the accountant/merchant-contract decision before production.

Return-policy windows are also implementation routing defaults, not a hard-coded legal conclusion. The default development policy currently models a 14-day withdrawal routing window and a 730-day guarantee workflow window because those are the Blueprint's implementation assumptions. Cases outside a configured window are routed to manual review rather than automatically denying statutory rights. Production legal copy, statutory exceptions, guarantee remedies, return-cost responsibility and any future law changes must be versioned/configurable and approved by Greek counsel.


## Multi-location merchant fairness — Build 0.19

A legal merchant/business receives one organic fairness opportunity per canonical variant and customer context, regardless of how many active branches offer the product. Branches are operational fulfilment choices, not separate bidders. Once the merchant is selected by deficit rotation, location resolution may consider customer fulfilment fit, stock freshness and capacity. Objective capacity can make a location unavailable, but branches do not have their capacity weights summed to increase the merchant's target exposure. Any future exception to this rule requires an explicit, auditable commercial/policy decision rather than a hidden ranking change.


## Progressive commerce by category — Build 0.20

Category eligibility is not equivalent to universal instant checkout. Buy Local Sparta uses explicit category commerce modes: ordinary shippable goods can use standard checkout, compatibility-sensitive goods require a customer compatibility acknowledgement/advice path, regulated/mixed categories require product-level clearance before checkout, and vehicle/directory-only categories remain enquiry/appointment-first. These gates are customer-safety and operating-policy controls, not inputs to Fair Vendor Exposure.

Attribute schemas are governed at category level and normalized before product matching/publication. Required attributes and filter facets therefore come from taxonomy policy rather than arbitrary vendor text. Product-level legal/compliance evidence can further narrow what is sellable; an Admin policy setting must never be interpreted as legal authorization for a restricted product. Greek legal/product-safety review remains required before activating regulated categories.


## Platform promotions and coupon accounting boundary — Build 0.21

Public retail price, announced reductions and coupons belong to Buy Local Sparta as consumer-facing seller; supplier purchase prices remain private B2B terms. Promotion eligibility therefore never changes the Fair Vendor Exposure rotation and no merchant can pay for or undercut into organic identical-product visibility.

Price-reduction history is append-only. Campaigns cannot be created retroactively or overlap for one canonical product, and a base-price change is blocked when it would invalidate an unfinished announced reduction. The customer order snapshots platform pricing source, prior-price evidence and coupon allocation in integer minor units. Coupon usage is reversed only for a pre-capture cancellation; ordinary returns/refunds keep the original redemption consumed while refund calculations return the amount actually paid for the affected quantity.

The exact Greek tax-document/VAT presentation of platform-funded coupons and announced reductions remains a production accounting/legal configuration gate; the software records enough immutable pricing provenance to implement the approved treatment without reconstructing history later.

# KONTA MOY × PosoKanei — standalone product & supermarket price explorer

Status: **evaluation implementation only**. No production route, public price display, live API integration, retailer checkout, or rights clearance is implied by this document.

## Product promise

A consumer should be able to search and browse source products and take two independent actions:

1. **Exact item — cheapest retailer**: Open a product and compare each Greek supermarket's recorded price (all observed offers, ascending), then choose one retailer's reference offer. Show observed date, missing-chain caveat and savings versus the highest *observed* price.
2. **Alternative brands — cheapest comparable item**: For reviewed equivalent goods (e.g. canned *chopped tomatoes*, not passata or whole tomatoes), list all brands and package sizes in the group. Default to the lowest *€/kg* or *€/L* when units can be normalized. Also offer a clearly different sort by lowest *package shelf price*. Keep the selected brand and retailer visible.

A choice means **save/select a supermarket reference offer**, not buy from KONTA MOY. Price observation does not prove local stock, an active offer at the nearest store, or delivery/checkout availability.

## Proposed public UX (after rights approval)

Standalone destination: `/posokanei`, identified as **KONTA MOY × PosoKanei**. Product names and price data may be publicly displayed only after rights and conditions are reviewed. Attribution must avoid implying an official partnership or retailer affiliation unless established.

- Search: Greek text, spelling variations, brand, category; browse by source category. Initial quick suggestion: least expensive applicable offers, not a fake cart.
- Search tile: product name, pack size, brand, **από €X στο [retailer]**, `[date/time]`, plus `Σύγκριση σούπερ μάρκετ`. No product images until permission is confirmed.
- Exact item page/drawer: full retailer list sorted by observed package price, discount flag, normalized unit price when trustworthy, savings from listed comparison, `Επιλογή τιμής` for any retailer (not just the winner). If no data, show `Δεν υπάρχει διαθέσιμη καταγεγραμμένη τιμή`.
- Alternatives area: **Άλλες μάρκες — ίδιο είδος** from `approved` group membership only. Two explicit ranking tabs: `Συμφέρει ανά κιλό/λίτρο` and `Χαμηλότερη τιμή συσκευασίας`. Show lowest eligible option, own best retailer, full alternatives and explicit `μη συγκρίσιμο` where relevant.
- Saved comparison list: keep selected source-product × retailer prices separate from KONTA MOY marketplace cart. Future basket algorithm: (a) cheapest sum across multiple supermarkets, (b) cheapest single-store complete basket, plus coverage gaps and number of stores. Never add absent items as zero-cost.
- Filters: supermarket chain, brand, pack size/normalized unit, category, private label, promotion, snapshot recency; optional geographic filtering **only when branch/store coverage is actually verified**, never pretend chain-level prices equal local-store prices.
- Transparency: prominent "Ενδεικτικές καταγεγραμμένες τιμές • όχι διαθεσιμότητα"; source name, archive collection date, price observation timestamp, methodology; alert on stale snapshot. Never invent store-specific inventory or discount eligibility.

## Equivalence & recommendation governance

Model a product independent of a source SKU. Curated comparison groups should include `comparison_group_id`, `display_label`, `normalized_basis` (kg/l/piece), `material_or_food_kind`, `physical_form` (chopped/whole/purée), optional diet/process/ingredient attributes, `review_status`, `reviewer`, `reviewed_at`, and source-product memberships.

Candidate generation may use category, Greek normalization, tokens, units, ingredient and form extraction, and barcodes, but **candidate != approved comparison**. Each public cross-brand group is review-gated. Price ranking uses actual observed retailer rows after country/date filters. Equal exact items across shops are compared on package price. Pack sizes that differ are also compared by €/kg or €/L when quantities are reliable. Unknown quantity items can appear with a caveat but cannot win the €/unit ranking. No automatic equivalence between chopped tomatoes, passata, fresh tomatoes, salted tomatoes, sauces, or double concentrate.

Do not merge equivalence identities with KONTA MOY canonical product families or vendor offer IDs. Optional later cross-catalog references must be explicit, reviewed and never turn supermarket reference prices into buyable offers.

## Technical design

Keep separate tables / read models, once commercial display rights are cleared:

- `market_reference_sources` (permission, attribution, collection policy)
- `market_reference_snapshots` (date, source checksum, total vs collected, completeness, ingest run)
- `market_reference_products` (external source identifiers, attributes, brand, pack)
- `market_reference_retailers` (country, source retailer ID/name)
- `market_reference_prices` (snapshot/product/retailer key, shelf price, unit price, observation time)
- `market_comparison_groups` and `market_comparison_group_members` (reviewed equivalence)
- `market_price_selection_lists` / items (reference selections, never transactional marketplace carts)

Use a *single atomic published-snapshot pointer* after staged import and validation: consumers should never compare rows from different days without an explicit history mode. Validate negative/zero prices, duplicates, missing products and cross-country records. Keep all provider data isolated from vendor RLS and commerce payment/checkout functions. Index search and recent-price reads; no per-row upstream API calls on user searches.

Under `scripts/posokanei`, `comparison-engine.mjs` exposes:
- `exactProductOffers(productId, observedPrices, {snapshotDate,country,retailerIds})`
- `compareApprovedAlternatives({approvedGroup,products,observations,snapshotDate,country,retailerIds,ranking})`

This is a pure **offline staging comparator**; performance, UI, DB migrations, realtime jobs, and source permission checks remain separate milestones. Tests live in `comparison-engine.test.mjs`.

## Non-negotiable release checks

1. Verify explicit legal/data-reuse and product-image rights, or obtain licensed/authorized data feed. The mirror's MIT **code** license is not a license to commercially redistribute its underlying database.
2. Verify full snapshot import, source timestamps, retailer identity mappings, update frequency, repeatability, and a stale-data fallback.
3. Curate reviewed comparable-product groups and sample-test food form, unit and variant correctness.
4. Create isolated database/read API, rate/cost protections, accessible responsive UI and noindex while gating.
5. Test at least: exact-retailer selection, cheaper alternative among brands, unit versus package sort, ties, unavailable chains, no retailer prices, missing pack sizes, freshness, no cross-country pricing, and false equivalence prevention.
6. Unlock public features only with a dedicated explicit release flag after rights approval. Do not expose a mocked or incomplete price listing as if live.

## Release milestones

A. Offline comparator + tests + documentation (current PR)
B. Licensed or otherwise authorized read model with verified ingestion and approved groups
C. Gated interactive browsing + exact-retailer selection
D. Cross-brand recommendations, saved lists, basket optimization and alerts


## Implemented offline basket-planning algorithm

A shopping list contains independent, uniquely identified lines. The optimizer accepts an exact source product plus required package count, or an approved comparison group plus required amount in kg/l/piece. Group lines may lock to a specific approved source product. Brand candidates outside the approved group are categorically excluded.

For each retailer, each line has candidate source SKUs, quantities rounded up to full packages, and total price in integer EUR cents. A candidate is valid only for one explicit snapshot date and country (GR by default). Invalid and missing prices are excluded; ambiguous duplicate retailer/product observations are rejected. Optimizing by total basket price is distinct from minimizing the unit price of a single package.

Calculate:
- **One supermarket:** cheapest *complete* basket from one retailer; report partial coverage and missing-item IDs for stores that lack items, without calling the partial subtotal the basket price.
- **Any number of supermarkets:** cheapest independently chosen priced alternative for every line; return null if any requested line cannot be priced.
- **Limit supermarket chains to 1, 2, 3, or 4:** exhaustively enumerate retailer combinations, select the lowest-priced valid item from each allowed chain, and rank full baskets by minimum total price, then fewest chains, then stable retailer ID. Exact within the documented cap of 24 relevant chains.
- **Savings:** report only when both the cheapest complete one-store baseline and the complete multi-store plan exist; savings are based on comparable requested line quantities, not omitted items.

Every plan records its source product, selected retailer, package count, required/fulfilled amount, snapshot date, source price timestamp, and chain count. It is a **comparison list**, not an order, store inventory promise, delivery quote or an endorsement by a supermarket.

### Current offline interfaces

- \`basket-optimizer.mjs\`: \`optimizeReferenceBasket({...})\`; fully separate from the commerce and payments application.
- \`optimize-basket.mjs\`: local-only JSONL staged import reader, accepted input list + reviewed group definitions, private JSON report and fail-closed manifest verification.
- \`basket-optimizer.test.mjs\` and \`optimize-basket.test.mjs\`: deterministic economics and end-to-end fixture tests.
- Workflow \`PosoKanei Reference Evaluation\`: validates importer, retailer comparator and basket optimizer on PR changes.

### Intended mobile view once data rights clear

Show a shopping-list editor, 3 comparable result tabs (**Ελάχιστο σύνολο**, **Σε 1 σούπερ μάρκετ**, **Μέχρι 2–3 σούπερ μάρκετ**), line-level cheapest suggestions and **Προτίμηση μάρκας** overrides. Emphasize that visiting more chains can be inconvenient, and display chain count alongside savings. If a chosen chain cannot price an item, show it in **Προϊόντα που λείπουν**, never conceal it inside an attractive but incomplete total. Always display source date and avoid branch-level locality claims without verified source evidence.

**Important:** No public UI or recurring importer is present. Any public browsing, use of images and prices, production persistence or merchant-like use still depends on rights and a separately approved release.

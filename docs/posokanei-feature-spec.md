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

- `basket-optimizer.mjs`: `optimizeReferenceBasket({...})`; fully separate from the commerce and payments application.
- `optimize-basket.mjs`: local-only JSONL staged import reader, accepted input list + reviewed group definitions, private JSON report and fail-closed manifest verification.
- `basket-optimizer.test.mjs` and `optimize-basket.test.mjs`: deterministic economics and end-to-end fixture tests.
- Workflow `PosoKanei Reference Evaluation`: validates importer, retailer comparator and basket optimizer on PR changes.

### Intended mobile view once data rights clear

Show a shopping-list editor, 3 comparable result tabs (**Ελάχιστο σύνολο**, **Σε 1 σούπερ μάρκετ**, **Μέχρι 2–3 σούπερ μάρκετ**), line-level cheapest suggestions and **Προτίμηση μάρκας** overrides. Emphasize that visiting more chains can be inconvenient, and display chain count alongside savings. If a chosen chain cannot price an item, show it in **Προϊόντα που λείπουν**, never conceal it inside an attractive but incomplete total. Always display source date and avoid branch-level locality claims without verified source evidence.

**Important:** No public UI or recurring importer is present. Any public browsing, use of images and prices, production persistence or merchant-like use still depends on rights and a separately approved release.


## Private interactive admin preview (implemented in the draft PR)

A responsive Greek prototype now exists at **`/admin/posokanei/preview`**, linked via a catalog-permission-controlled tile in the admin command centre. The route requires an authenticated platform admin with `catalog.read` and publishes `noindex` metadata. It is not a public `/posokanei` route, nor does it imply a live data feed.

- Client UI: `apps/web/src/components/PosoKaneiPreviewClient.tsx` and isolated CSS module.
- Browse/search by Greek text and product category.
- Expand any product to view **all** illustrative chain price observations ordered cheapest first; selecting any retailer adds an exact, supermarket-locked line to the comparison list.
- Compare curated equivalent items using a selectable €/kg or shelf-package-price sort. The demo's chopped tomato group deliberately excludes passata.
- Add fixed-brand or flexible equivalent-brand requirements to the list; edit package count, required quantity, brand locks and retailer locks.
- Compare cheapest full basket across one chain, 2–3 chains, and all chains; explain missing goods and show selected chain IDs/items.
- The server-side `POST /api/admin/posokanei-preview` calculation is **authenticated, RBAC-checked and CSRF-protected**. It invokes the same isolated `scripts/posokanei/basket-optimizer.mjs` that the offline CLI tests. It NEVER trusts price, product or reviewed-group data supplied by the browser and does not access the third-party upstream API.
- All UI prices are **synthetic fixtures**: `apps/web/src/lib/posokanei-preview-fixture.ts` explicitly has invented products, sellers and prices. Demo content must not be misrepresented as actual supermarket price observations, and it must not be indexed.
- No order/payment/cart calls, no writes to PostgreSQL, no public data or images, no scheduled collection.

**To preview:** the draft PR must first pass release checks and be deployed to an admin-authenticated preview environment. The path does not exist on the production main branch until the changes are merged and deployed. Admin permissions cannot be bypassed by knowing the URL.

**Remaining prerequisites for real public browsing:** audit permissible data usage, authorize commercial product/price listings, ingest actual data into an independently governed source-specific database model with reviewed equivalents and data freshness/availability, then swap the synthetic UI provider for an authenticated reviewed read model before explicitly enabling the public route. Never enable public commercial price display merely by switching an environment flag.


## October 16 — rights-gated public interface implemented in PR #1554

A real, responsive Greek customer explorer now exists in source at `/posokanei`. Its product-search page and `GET /api/posokanei` listing can display exact-product chain comparisons, price observations, approved cross-brand alternatives, and retailer-specific selections. The comparison list submits to `POST /api/posokanei/optimize`, which uses the same isolated, tested basket optimizer as the private preview. The public UI never imports synthetic admin prices; no source imagery, retailer checkout, physical-stock claims or KONTA MOY marketplace offers are used.

The public price API is deliberately **fail closed**. Display is possible only with all of:

- `POSOKANEI_PUBLIC_RELEASE_ENABLED=true`
- `POSOKANEI_DATA_REUSE_APPROVED=true` — operator attests source/database redistribution and display rights, separate from the importer code's license
- `POSOKANEI_PUBLIC_SNAPSHOT_URL=https://...` — a controlled HTTPS location serving the `build-public-snapshot.mjs` JSON read artifact with approved `permission_reference`

The server validates snapshot identity, dated freshness (max 10 days), complete product count, approved curated equivalence groups, unique country-GR retailer observations and positive prices. Without these conditions, the landing page displays a clearly marked not-yet-published empty state; it never exposes fixture or research-only archive records. Metadata is noindex until the release flag and rights flag are set.

`build-public-snapshot.mjs` accepts only valid importer staging input with an independently verified human approval reference. It outputs a local JSON candidate and **does not upload or publish it**. A scheduled private GitHub Action can fetch the latest public mirror daily, log manifest counts/checksum only, and never upload raw third-party datasets; activation requires merging the PR. No production import, public price release, or license grant has occurred.

The existing `/admin/posokanei/preview` remains a strictly synthetic administrator demo. Before enabling the public flags: obtain documented rights, run a complete importer stage and verify quality, prepare human-reviewed groups, upload the approved artifact to operator-controlled HTTPS storage, and test browse/optimize plus freshness on staging.


## October 16: Public-sector statutory-reuse live feed option

Greek Law 4727/2020, Article 61 establishes presumptive commercial/noncommercial reuse of published public-sector data, subject to Article 59 exclusions, including third-party intellectual property, protected emblems and logos. The operator confirms statutory reuse of basic **product-name, price, chain name and package measurement observations**. The MIT license of a third-party archive is not the legal basis for the underlying government-source data. No imagery, logos, store stock, source page HTML, or commercial endorsements are copied.

The optional `POSOKANEI_PUBLIC_SOURCE_MODE=government_mirror` uses a fixed HTTPS allowlisted upstream `spyrosavl/posokanei` mirror of government-origin published records, verifies its `data/latest.json` pointer, complete date-scoped snapshot, duplicates and GR prices through the *same* importer adapter, and assembles a read-only public reference in memory, with a 15-minute per-process refresh. The public site attributes both the originating government service and the third-party archive. Price data remains non-transactional. An absent or stale latest snapshot fails closed; no fake price fallback. Cross-brand equivalence groups remain empty until individually reviewed and published; exact-brand and retailer comparisons work without them.

Production controls: `POSOKANEI_PUBLIC_RELEASE_ENABLED=true`, `POSOKANEI_DATA_REUSE_APPROVED=true`, `POSOKANEI_PUBLIC_SOURCE_MODE=government_mirror`. The explicit approval flag reflects the operator's public-sector statutory-reuse determination; it is not a statement that the dataset carries an MIT license. These env vars require a new deployment when first configured. No public JSON snapshot storage URL is needed in this mode.

## Price-tie stop consolidation and availability-first comparator (October 2026)

**Optimizer:** Price is primary, fewer stops secondary, deterministic ID order tertiary. Each candidate set uses lowest EUR-cent prices for every basket line, then assigns tied offers jointly to the smallest set of supermarkets. For 1–5 allowed shops this secondary stop consolidation is exact. The unrestricted plan remains price-exact; for more than 12 chains, stop consolidation uses a documented deterministic coverage heuristic.

**Comparator:** coverageFirstSingleStore is an illustrative availability-first, single-supermarket heuristic, NOT the verified official PosoKanei algorithm. It prioritizes the number of covered distinct basket lines, using deterministic chain-ID order when coverage ties, not the overall price. Its total is available only when all items are covered. When incomplete, coveredSubtotalEur is a partial subtotal, not a basket total; savings and savings percentage must be null.

**Savings:** Compare the complete availability-first one-chain basket with the complete user-limited (up-to-five) optimized KONTA MOY plan, always applying global exclusions and required quantities. Otherwise state the missing coverage and suppress savings rather than valuing unpriced items at zero.

**Presentation:** Plans group items by the actual supermarkets needed, prominently disclose the tie rule and distinction between observed chain reference prices, on-shelf stock, travel costs and buyable checkout.

## Like-for-like partial coverage comparison

When the simulated availability-first supermarket covers only 15 of 20 selected lines, show that supermarket's observed per-package and line prices for those 15 products, and compare them against KONTA MOY's best price-split across the same 15 *exact SKUs, package counts and quantities* within the user's allowed chains and maximum 1–5 stores. This subset optimization is independent of the full 20-line optimization; the actual supermarkets required may consequently differ. Never silently change brands or product sizes for this comparison, even for approved substitute groups.

Present both matched-subset totals and every product-level pair of prices, supermarket chosen for the split, savings per line, total EUR savings and percentage against the coverage-first partial subtotal. Clearly label the remaining 5 items as excluded from this comparison, and retain the full 20-product result elsewhere. The single-store partial subtotal is *not* the cost of a full basket. If no matched lines exist, show no savings. Keep previously defined full-basket savings null where a complete one-store comparison is impossible. Apply all global supermarket exclusions to both price lists.

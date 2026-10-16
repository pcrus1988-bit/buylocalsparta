# PosoKanei market-price reference adapter

This is an evaluation-stage, read-only import path for daily supermarket price observations. It does NOT access the protected government endpoint, create sellable catalogue offers, change production PostgreSQL, imply retailer participation, or schedule jobs.

## Run

From the KONTA MOY repository root:

- Test the complete isolated feature: `node --test scripts/posokanei/*.test.mjs`
- Public snapshot: `node scripts/posokanei/import-snapshot.mjs --latest --out /tmp/kontamou-posokanei`
- Local JSON: `node scripts/posokanei/import-snapshot.mjs --input /path/to/snapshot.json --out /tmp/kontamou-posokanei`

The mirror at https://github.com/spyrosavl/posokanei publishes `data/latest.json`, which points to a dated complete JSON snapshot. The importer checks the expected total, date, complete coverage, duplicate identifiers and price validity.

It writes only local staging files:

- `manifest.json`: source, snapshot date, checksum, completeness, retailer IDs, warnings, rights warning
- `reference-products.jsonl`: PosoKanei product metadata and source identity
- `reference-prices.jsonl`: observed EUR prices by product/country/retailer, Greek retailers by default

## Important reuse and accuracy restrictions

The mirror's README attributes data copyright to PosoKanei's providers. A third-party client's MIT *code* licence does not confer rights to redistribute price databases or product images. Commercial public republication, ongoing bulk reuse, and image display require a separate rights/terms review. These outputs are **private evaluation data** pending that review.

An advertised retailer price is not a store-specific real-time price, verified stock, an authorised KONTA MOY vendor offer, or a location-aware notification opportunity. Keep this data in a **separate market-reference-price pipeline** and use source attribution and update timestamps. Do not copy images into the commerce catalogue without permission. Do not use retailer IDs as KONTA MOY vendor IDs. Do not publish reference prices as seller offers.

The upstream API is undocumented, and automated direct API access may receive a 403; do not spoof clients, defeat access limits, or depend on scraping. The public mirror can lag or change shape.

Before production use: obtain reuse approval or a licensed feed, validate product identity against existing canonical families, confirm geographical accuracy and permitted display, install appropriate source-specific monitoring, and create governed migrations/tests separately.


## Shopping-list optimization (private evaluation)

When a local staging snapshot is available, you can run a shopping-list comparison offline without creating a KONTA MOY cart or publishing any price.

Create a private JSON input file, for example /tmp/posokanei-list.json:

\`\`\`json
{
  "lines": [
    {"id":"rice","kind":"exact","sourceProductId":"REPLACE_WITH_ARCHIVE_ID","packageCount":2},
    {"id":"tomatoes","kind":"group","groupId":"reviewed-chopped-tomatoes","requiredBaseQuantity":0.8}
  ]
}
\`\`\`

The example IDs must be replaced with real staged identifiers in a local environment. A reviewed-groups JSON array is mandatory for group lines:

\`\`\`json
[
  {"id":"reviewed-chopped-tomatoes","status":"approved","basis":"kg","memberIds":["REPLACE_WITH_EXACT_CHOPPED_TOMATO_SOURCE_IDS"]}
]
\`\`\`

Run:

\`\`\`sh
node scripts/posokanei/optimize-basket.mjs \
  --staging /tmp/kontamou-posokanei \
  --list /tmp/posokanei-list.json \
  --groups /tmp/posokanei-reviewed-groups.json \
  --store-limit 3 \
  --out /tmp/private-posokanei-basket-result.json
\`\`\`

The output includes cheapest *complete* single-chain basket, cheapest complete split-chain basket within 1–4 chain visits, unconstrained cheapest chain mix, item selection/quantity, missing-item reasons, savings where a valid complete single-chain baseline exists, and source snapshot identity. Missing supermarket products **never** count as free basket items. If a basket cannot be completed, the displayed complete-basket total is null.

A group request uses a quantity in kg/l/piece and buys a whole number of packages from ONE equivalent source SKU for that line. A customer can lock a particular approved brand using \`lockedProductId\`, or use \`kind:"exact"\` to preserve a chosen source product. Only explicitly approved equivalence groups can substitute across brands. The comparator cannot infer source product equivalence from names alone.

The optimizer treats chain prices as historical references, not branch-specific guaranteed availability. Travel, loyalty cards, delivery, and discounts requiring special eligibility are not included. This is not the KONTA MOY shopping cart or checkout.

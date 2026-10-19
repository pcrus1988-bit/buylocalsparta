# NYXI — Brand, line, shade and evidence-provenance foundation (19 Oct 2026)

## What is now real

NYXI's production Supabase project `eemihhfreggbigxejjhj` holds **63 unresolved publisher-or-brand candidates** and **224 manufacturer source-atlas records** linked by source ID. No product line or shade was invented from those records.

Existing Atlas source roles include official manufacturer roots, collections, individual products and SDS documents. The `authority` field identifies a publisher or company; it is **not automatically an established brand, line, INCI formula, licensed acquisition right or swatch**. Names such as "Nail Alliance / Gelish" and "4mass S.A. / Claresa" are not collapsed into invented brand identities.

Private relational tables:
- `nyxi_nail_brand_publishers_v1` — identity candidate with stable `atlas-authority:md5(lower(name))` key, status `source_atlas_publisher_unresolved`.
- `nyxi_nail_publisher_sources_v1` — exact registered source links, `source_atlas_publisher`, independently reviewable.
- `nyxi_nail_product_lines_v1` — brand publisher, product type, line identity. Initially empty.
- `nyxi_nail_shade_variants_v1` — named shade, SKU, finish, opacity, packaging and optional shade entity. Initially empty.
- `nyxi_nail_shade_color_links_v1` — only joins a shade variant to a separately archived, hash-checked and reviewed-under-policy `nyxi_shade_measurements` observation. Initially empty.
- `nyxi_private_manufacturer_shade_readiness_v1` — aggregate private readiness for each publisher.
- `nyxi_private_manufacturer_acquisition_queue_v1` — 224 manufacturer source records, explicit next action for rights review, permissions or retry, and whether an original is archived.

All five new tables have RLS enabled, with no customer grants. The two views are `security_invoker=true`, select only for `service_role`. They provide **no public catalogue, public search index or rights bypass**.

## Distinguish actual colors and illustrative color previews

The photo UI has 18 demonstrative named HEX samples for interactive color exploration. These **are not verified commercial products** and not data from manufacturers. This PR adds `nyxi-app/lib/nyxi-color.ts` using reference OKLab (display sRGB) for more perceptually meaningful relative matching, and tests, while explicitly preserving the disclaimer. The app still does not offer a buy link or imply stock availability. Camera lighting, monitor gamut, gloss, shimmer, chrome, magnetics, opacity, application layers and white/black backgrounds can all change apparent shade.

For a real product: exact brand identity → line → SKU/shade → allowed manufacturer dataset/label/source → exact archived evidence → color observation with method, image/licence and calibration metadata → review → eventually a grounded match. Name-only shades, marketing swatches and user photos may offer *approximation*, never instrument-calibrated color. In the current production DB: **0 real product lines, 0 named shade variants, 0 verified color links, 0 shade measurements**.

## Rights and compliance

224 manufacturer source URLs are registered, **0 manufacturer pages archived**. Most still require asset-specific rights and robots review. The queue does not enable scraping. CND and other permission-required sources remain blocked.

New optional open-data candidate: <https://world.openbeautyfacts.org>. Open Beauty Facts contributes community product labels under ODbL; images have separate licensing. Community data is **not manufacturer confirmation**. No API calls or dataset imports are authorized yet. Before commercial use, assess attribution, ODbL share-alike and any adapted-database publication obligations, dataset isolation, community accuracy, product SKU recency and API rate limits; review separately for third-party images. Registration is `discovered` only; no source asset approval.

The collector retains the existing 10-minute schedule for **already approved exact assets**.

## Implementation and test

- Production migration `20261019051022_nyxi_private_brand_line_shade_provenance_v1` — relational foundation, private grants and shade provenance trigger.
- Production migration `20261019051606_nyxi_private_manufacturer_acquisition_queue_v1` — service-only acquisition review surface.
- SQL seed script is intentionally **two statements** and can be run again. Verified repeat execution did not create duplicates (63 candidates, 224 source links).
- Private Workbench tabs **Publisher Identity Intake** and **Manufacturer Sources Queue** expose status, next action and original URL, not document copies. The source registry tab reflects 307 registered sources (including unapproved Open Beauty Facts).
- `nyxi-app/tests/oklab-shades.test.mjs` checks reference primary color values, color symmetry, nearest sample, invalid HEX rejection and empty palette. Runs through existing `npm test` in `nyxi-app`.

## What remains for meaningful product recommendations

1. Secure explicit asset permissions or licensed manufacturer feeds, beginning with exact brand/line/SKU/INCI/SDS product records. Do not treat an HTML page being visible as bulk-commercial reuse permission.
2. Parse brand, line, product, finish, shade aliases and available SKUs with exact fragment and source.
3. Ingest true measured/authoritative swatches only with licensing, source-asset evidence, viewing conditions and human QA. Separate rough display color from calibrated color.
4. Match against connected merchant offers and real-time inventory only with verified store permissions. NYXI remains independently operable from KONTA MOY.
5. Only publish entries after the existing rights + independent fragment approval flow has authorized them.

Authoritative references: [OKLab conversion](https://bottosson.github.io/posts/oklab/), [Open Beauty Facts project](https://github.com/openfoodfacts/openbeautyfacts), and [ODbL licence guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/).

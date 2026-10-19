# NYXI — first licensed, real nail-product records · 19 October 2026

## Delivered, verified in production

NYXI is no longer limited to Source Atlas registrations for product labels. The official Open Beauty Facts (OBF) API was queried on its *nail-polishes* category. Its response reported **135 records** across three pages; **127** passed strict code/category/name checks and now sit in the private `nyxi_open_data` schema. **108** of the accepted records have ingredient-label text. The eight excluded records are missing a nonempty product name; the original response body for each source page is preserved in an audit batch, alongside SHA-256, so nothing was silently invented or discarded.

Successful API call: `GET https://world.openbeautyfacts.org/api/v2/search` with `categories_tags_en=nail-polishes`, `page_size=50`, bounded `page` 1–4, and fields `code,product_name,brands,categories_tags,ingredients_text,last_modified_t`. Custom identifying `User-Agent: NYXI-Research/0.1 (research@kontamou.site)`. The fourth page is empty at the current catalogue size.

**Important distinction:** Open Beauty Facts is **community-contributed**. Product barcodes and text are leads for reviewing actual formula labels, **not manufacturer-verified SKU identities, a calibrated HEX swatch, ingredient safety assessment, current formula, professional-use legal verdict or live stock**. The brand string `HEMA`, for example, is a **brand identifier in the product field**, *not* evidence that a product contains chemical 2-hydroxyethyl methacrylate. The `brands_as_entered` value is NEVER joined to the governed `nyxi_entities` chemical namespace by name equality.

## ODbL compliance and isolation

The database and derived structured records are under **Open Database License v1.0**, individual contents under **DbCL v1.0**. Original product images are excluded entirely (separate copyright and CC BY-SA issues). The three first-party official references are:
- [OBF specialist API documentation](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/)
- [API usage, limits and user agent](https://openfoodfacts.github.io/documentation/docs/api/)
- [Licensing](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/)

All source-origin data, including the raw response text and an SHA-256 of the stored response body, is held **in the separate `nyxi_open_data` schema**, not inserted into proprietary `nyxi_nail_shade_variants_v1`, `nyxi_entities`, public search, legal claims, or private source evidence bucket. `anon` and normal signed-in roles have no schema usage and no table SELECT; no public release is authorized. Tables additionally enforce `publication_approved=false`, `community_verified_by_manufacturer=false`, `shade_hex_confirmed=false` and `no_images=true` where applicable.

If NYXI later publicly uses or distributes an adapted OBF database, **we must first expose the adapted database in an ODbL-compatible downloadable form**, provide correct contributor attribution, and apply share-alike obligations. That export does NOT yet exist. This current ingestion is limited to private research and QA. Do not copy OBF records into a proprietary exclusive licence table.

## Automation and validation

Production migrations:
- `20261019131623_nyxi_open_beauty_facts_odbl_quarantine_v1`
- `20261019131838_nyxi_obf_open_data_private_quality_queue_v1`
- `20261019132006_nyxi_obf_odbl_bounded_daily_private_sync_v1`

A bounded sync queues **four API search requests per day**, below published search limit of 10 requests/minute/IP. The asynchronous `pg_net` responses are processed separately; request IDs, upstream count, errors and reportable compliance flags are recorded. Production cron:
- `nyxi-obf-nail-product-daily-private` at 02:00 UTC.
- `nyxi-obf-nail-product-daily-process` at 02:05 UTC.

Live first run: four requested, four processed, zero failures, 127 valid rows, 135 reported. Rerunning same day is idempotent by `(sync_day,page)`; no hourly search-as-you-type workload hits this upstream. A source-license gate blocks the scheduled fetch unless source registry explicitly says `odbl_private_research_approved_no_public_use`. If API request fails or shape changes, daily processing records failure; it does not infer products.

The existing separate NYXI evidence crawler remains on its own 10-minute cadence, with exact asset approvals, independent review and SHA-original capture. These two pipelines do not grant permissions to each other.

## Rights-reviewed manufacturer intake

Live review of official terms:
- [Akzentz terms](https://akzentz.com/policies/terms-of-service): prohibits copying or commercial exploitation without written permission.
- [Manucurist legal notice](https://www.manucurist.com/policies/legal-notice): requires written authorization for reproduction and adaptation.

All 15 known manufacturer-source Atlas entries from these two publishers now explicitly require permission before automated commercial collection. Existing CND and others already gated remain unchanged. *Discovery is not authorisation*, and publishing an SDS for professional reading is not permission to mirror it for commercial research.

## Owner Workbench

The private [NYXI Research Workbench](https://docs.google.com/spreadsheets/d/1dgAmsq_bA662vjZEFsNc4Q8Tg8ugi5SWQODkVMTCkW8/edit) contains:
- **Licensed Nail Products**: 127 source-linked community records and label text (no images or shade HEX).
- **OBF Product QA**: eight missing-name records needing human resolution (deduplicated across source fetches).
- **Licensed Sync Status**: four fetched/processed pages, source totals and rights notices.
- Updated **Manufacturer Sources Queue** and **LIVE Intake** with written permission conditions.

These Sheets are *private reviewer convenience copies of ODbL data*, so the same attribution and adapted-database licence requirements apply if anyone republishes them. Never share the workbook publicly until the licensing workflow is reviewed.

## Next priorities

1. Obtain explicit brand/manufacturer licences or distributor feeds for SKU/line/shade/INCI/SDS with update and archival rights.
2. Independently check barcode against exact brand/line and **batch-specific formula** evidence. Different regional/batch ingredient lists cannot be generalized.
3. Implement compliant open-data export/attribution before exposing community data in the public NYXI search.
4. Develop real color observation acquisition and rendering metadata (illuminant, lightness, sample method, gloss/opacity, device), without guessing numeric HEX from names.
5. Add anomaly review and dedup on community brand strings (especially `HEMA`), manufacturer identities and labels without automatically joining those to legal entities.

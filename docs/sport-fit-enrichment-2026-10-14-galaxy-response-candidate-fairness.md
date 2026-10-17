# KONTA MOY Sport & Fit — 14 October 2026, second governed batch

## Scope

This batch builds on **the existing 0448–0449 work in PR #1536**. No parallel ontology, ungoverned AI-generated claims, or per-vendor technical duplication. It extends the canonical-family technical attributes, evidence graph, queue and indexed recommendation projection already in KONTA MOY.

## Schema 0450: evidence-first model/surface/fit enrichment

Ten manufacturer-backed, normalized fact rows (and ten matching `sport_product_fact_evidence` rows) across **five currently approved-offer footwear families**, with five new `sport_knowledge_sources`.

| Exact style / family | Technical knowledge added | Manufacturer provenance |
|---|---|---|
| Galaxy 7 W **JP6592** | Medium-width manufacturer classification → controlled standard width; treadmill surface | [adidas Galaxy 7 Medium/Treadmill collection](https://www.adidas.com/us/running_promo-medium-galaxy-treadmill) |
| Response 2 M **KJ1750** | Treadmill surface (retains road fact) | [adidas Response/Treadmill](https://www.adidas.com/us/response-treadmill) |
| Response 2 W **KJ1757** | Treadmill surface (retains existing road/trail facts) | [adidas Response/Treadmill](https://www.adidas.com/us/response-treadmill) |
| Response 2 M **KK4280** | Treadmill surface; exact Cloudfoam+ technology and qualitative manufacturer Regular fit | [adidas Response/Treadmill](https://www.adidas.com/us/response-treadmill) and [adidas KK4280 official product](https://www.adidas.mx/tenis-de-running-response-2/KK4280.html) |
| Galaxy 8 M **IH9808** | Exact road surface; manufacturer true-to-size length; manufacturer model-line short-distance training use | [adidas exact IH9808](https://www.adidas.fi/galaxy-8-running-shoes/IH9808.html) and [same-model KZ6742 reference](https://www.adidas.com/us/galaxy-8-run/KZ6742.html) |

The `Galaxy 8 IH9808` exact first-party page also lists **326 g reference weight, 5 mm drop (37 mm/32 mm)** and Cloudfoam; these already exist in the catalogue and are deliberately **not duplicated**.

**Evidence policy:** Manufacturer collection pages only govern model-level applicability when the named model is explicitly represented. The reference same-model style KZ6742 only governs short-distance context, not a potentially variant-specific measurement. No width is invented from `Regular fit`. No numeric cushioning, technical support or toe-box profile is inferred from Cloudfoam+ copy. In all other cases unknown remains unknown.

The migration guards the *exact* canonical family and style identity, an approved visible offer, expected empty attribute positions, controlled vocabulary and exactly 10 fact/evidence rows. It refreshes `bls_private.refresh_sport_product_knowledge`, removes only resolved enrichment-queue fields, and leaves conflicts protected. It is inert for family writes on an empty catalogue bootstrap.

## Recommendation bug: role and tier contamination

Previously `sportProductRole` examined the entire product text and matched `shoe` **before** examining the controlled `socks-hosiery` / accessories category. This could classify a football sock described as compatible with a shoe as primary footwear.

Now **controlled category wins over supplier title, description and attributes** for socks, accessories, apparel, and footwear. When an unknown category requires fallback, only the title and category identity are used; free-form prose cannot turn a sock, bag or shirt into Tier 1.

New automated regression tests cover footwear-looking socks, shoe carry bags, apparel, and budget-driven attempts to rescue a hard-known cross-sport mismatch. Previously valid running shoes remain Tier 1.

## Recommendation bug: bounded catalogue candidate starvation

Previously `readSportFitCatalog` ordered the entire **320-row** eligible candidate pool by category priority: running footwear first, sneakers second, socks third, then apparel. A sufficiently large sock/footwear family would consume all 320 entries *before* the recommendation engine evaluated sport-specific eligibility. Valid apparel and other sports could become unreachable.

The bounded query now uses a category-round-robin `ROW_NUMBER() OVER (PARTITION BY c.code ...)` ordering, putting the first sellable variant from each eligible category ahead of its second, before the existing global 320-row limit. This is deterministic and computed within PostgreSQL, not an AI/runtime API call. The SQL remains bounded and continues to require fresh sellable stock.

Read-only comparative query on the live Kerasiotis women's eligible category subset on 14 Oct 2026:

| | Old priority ordering | Proposed category-balanced ordering |
|---|---:|---:|
| Selected rows | 320 | 320 |
| Distinct categories represented | **3** | **7** |
| Apparel variant rows | **0** | **182** |
| Sock variant rows | 160 | 46 |
| Running variant rows | 81 | 46 |

This diagnostic mirrors stock/pricing/offer eligibility, but is not a full production Studio request; it omits some visibility/location clauses. These numbers demonstrate the starvation mechanism rather than claiming live Studio output changed already.

## Validations and release

* Database changes 0448→0449→0450 executed together on the live populated Supabase catalogue in a single transaction ending with **ROLLBACK**. All SQL guards passed. No production rows were committed.
* Runtime `EXPECTED_SCHEMA_VERSION` advanced to **450** in the PR branch; checksum manifest `checksums.0450.json` added.
* New tests: three regression cases in the existing Sport & Fit test suite (category/tier, hard cross-sport exclusion, candidate-pool ordering).
* Full CI must be inspected after the latest commit. The branch is not deployed and the runtime behavior has **not** been measured in production.

## Remaining high-value unknowns / next batch

1. Exact size **variant** availability after category-balanced retrieval: a per-category cap can still strand uncommon sizes. The next query evolution should select *family/size* coverage before ranking, without loading entire catalogues.
2. Round-robin category fairness should be measured in the full production route, including all visibility predicates and timings. Benchmark with Kerasiotis and multi-vendor audiences; watch for window-sort cost.
3. Add verified outdoor/court surface and fitting facts for sellable Adizero SL2, Anylander, Cloud X 5, then court shoes.
4. Expand normalized requires/recommended_with/incompatible_with graph and kit reasoning with first-party support rather than text-only similarity.
5. Detailed footwear fit normalization must remain manufacturer-specific and measure-to-variant aware.

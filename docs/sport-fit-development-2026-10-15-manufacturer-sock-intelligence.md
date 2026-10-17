# KONTA MOY Sport & Fit — manufacturer sock-intelligence enrichment, 15 October 2026

## Purpose and current commercial coverage

This is the next batch in the existing canonical-family Sport & Fit system (PR #1536). Prior live diagnostics found 89 sellable sock families, 192 variants and widespread unknown material/functional evidence. This pass picks four **currently visible, approved-offer** adidas sock families with exact style-code first-party product pages. We do not substitute a generic style name for a manufacturer's exact code.

| Manufacturer code | Canonical family | Manufacturer evidence | Facts |
|---|---|---|---|
| **HT3437** | `2336593f-b85f-447e-8278-0d3968bc48e3` | [adidas Thailand HT3437](https://www.adidas.co.th/en/3-stripes-linear-half-crew-cushioned-socks-3-pairs/HT3437.html) | quarter height, 3-pack, 71/26/2/1 material %, heel + toe cushioning zones |
| **IC1305** | `3809ac6e-e8ed-4465-bb62-0ee23fa8ca6f` | [adidas Qatar IC1305](https://www.adidas.com/qa/en/think-linear-ankle-socks-3-pairs/IC1305.html) | ankle height, 3-pack, 68/29/2/1 material %; padding unknown |
| **IZ0106** | `83d8ca67-61fd-413f-bdef-b0b64576a507` | [adidas Germany IZ0106](https://www.adidas.de/en/linear-crew-cushioned-socks-3-pairs/IZ0106.html) | crew height, 3-pack, 75/22/2/1 material %, heel + toe cushioning zones, general-training context |
| **HT3457** | `cb6d72b5-8835-4f58-8fe9-070dd9991426` | [adidas Ireland HT3457](https://www.adidas.ie/linear-ankle-cushioned-socks-3-pairs/HT3457.html) | ankle height, 3-pack, 71/26/2/1 material %, heel + toe cushioning zones, gym context |

Composition sequence = cotton, recycled polyester, elastane, recycled nylon; 4 × 4 measurements total. **All four manufacturer percentages sum to 100**, checked by SQL migration.

### Exact-model technical normalization

* **32 structured facts**, each with **one linked active first-party `sport_product_fact_evidence` record**, sourced from **four newly registered `sport_knowledge_sources` manufacturer pages**.
* Five new attribute definitions in the original global attribute registry, scoped to Sport & Fit socks: `sock_cotton_pct`, `sock_polyester_pct`, `sock_elastane_pct`, `sock_nylon_pct`, and controlled multi-valued `sock_cushion_zone` (`heel`/`toe`). Existing `sock_height`, `pack_quantity`, `sport_activity` reused and remain manufacturer-grounded.
* All facts are attached **once per canonical family**, never replicated across size/color variants or vendor offers.
* The `apparel` type receives the necessary optional family attribute registrations, and the existing `bls_private.refresh_sport_product_knowledge` projection runs. Existing evidence conflict/identity/approved offer guards are maintained.
* Machine-readable manufacturer blend and 3-pack counts are projected from the existing family fact tables; no opaque marketing prose is promoted as structured technical truth.
* **No unsupported inferences:** heel/toe cushioning zones do **not** determine low/medium/max cushioning; cotton/polyester percentages do **not** prove moisture wicking, compression, breathability or foot support; a weekend/gym sock does **not** automatically become a specialist running or hiking sock. `IC1305` has no inferred padding or activity facts.

### Recommendation and size-variant correctness

The Studio now understands verified sock zones and blend details for human-readable Greek reasons **only when matching active manufacturer evidence exists**. The new qualitative facts do not boost the numeric recommendation score or bypass hard rules.

A second size-binding issue was corrected: while footwear was already constrained to a single in-stock canonical variant, socks could still inherit a family-wide array of sizes. Sock sizes are now also taken only from `cv.variant_attributes->>'size'` on the **same stocked variant**. One valid EU interval (e.g. `40-42`) per offer is supported; misleading range lists, contradictory/out-of-bounds values and absent sizes remain unknown.

For a visitor who specifies a numeric EU shoe size, the `Complete My Kit` selection now rejects a sock with **unknown or incorrect** stocked size instead of admitting it based on generic product descriptions, pack size or a family-wide size range. Non-sized browsing remains possible.

### Tests and verification

Four additional unit test cases exercise first-party heel/toe evidence versus missing evidence, no inference from sock material percentages, normalized EU sock range validation, and exact in-stock sock family variant selection with unknown/wrong-size fallbacks.

**Migration rehearsal passed:** The literal committed SQL chain 0448–0453 was run on the populated production catalog in one explicit `BEGIN` transaction and ended with `ROLLBACK`. The resulting in-transaction query returned **32** manufacturer sock evidence records and migration assertions found no introduced governed conflicts. Production data was not changed.

Migration **0453** and `checksums.0453.json` are committed, runtime gate is **453**. Main branch still contains an unrelated noncanonical Research thank-you safety SQL migration; all PR workflows requiring canonical full-chain migrations may remain blocked until the research-owned migration is separately repaired. No safety delivery controls were modified here.

### Next high-value gaps

1. Complete exact manufacturer **sport-specific** sock evidence (football, technical running and hiking); current products with generic composition are not falsely reclassified as high-performance equipment.
2. Bind documented sock cushioning/volume to measured foot and exact footwear model fit as evidence becomes available; do not invent thickness from cotton percentage.
3. Build evidence-backed **family subtype** mapping for shin guards, hats, footwear weather layers and racket equipment without guessing from titles.
4. Continue exact-size/bounded candidate-selection performance checks under production-like load; especially unusual fractional footwear sizes.
5. Resolve default-branch migration-integrity issue with the Research owner before merging/deploying Sport & Fit 0448–0453.

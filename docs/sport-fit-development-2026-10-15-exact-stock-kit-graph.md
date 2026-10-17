# KONTA MOY Sport & Fit — 15 October 2026, fourth implementation batch

## Code and storage: existing architecture only

All changes are on the same governed Sport & Fit PR #1536, retaining canonical family → explicit canonical variant → approved live vendor offer, normalized Sport & Fit manufacturer evidence, exact manufacturer size guides, deterministic scorer and 3D Studio presentation.

### A. Requested footwear sizes must be bound to actual sellable variants

**Bug:** `readSportFitCatalog` received a *particular in-stock canonical variant*, but the metadata layer could return a family/translation-level `specifications.sizes` list and mark all sizes available from one offer. The scorer only hard-rejected known mismatches, not products for which the size of the **stocked variant** was unknown.

**Fix:** The catalogue query now selects `cv.variant_attributes->>'size'` for the same variant joined to its approved sellable offer and fresh inventory balance. For footwear, only a valid explicit EU-size identity is exposed as a positive in-stock size. Family size arrays and vendor marketing text never prove availability for that specific variant. Compact manufacturer supplier fractions (e.g. 4713 → EU 47⅓) still resolve through the existing `canonicalizeCatalogSize` parser, with invalid/out-of-range size tokens rejected.

If the visitor specifies an exact footwear size and the variant lacks explicit verifiable size identity, it is **ineligible** with a separate `fit.variant_size_unknown` explanation, not quietly presented as available. If a definite but wrong size is stocked, it is **ineligible** with `fit.requested_size_mismatch`. No blanket brand size conversions. Non-size-specific browsing remains available.

**Read-only live catalogue diagnostic (15 Oct 2026):** across ten core footwear categories, the approved, visible, non-paused, fresh-stock sellable-offer subset had 239 footwear offers covering 96 canonical families; 218 offers had an explicit variant size and 21 did not. This diagnostic counted positive stock and fresh confirmation, but omitted some vendor/location visibility checks present in the actual catalogue query. It is not a claim about storefront totals.

The scorer still deduplicates canonical families **after** hard-size matching, so when EU 42 and EU 43 are distinct sellable variants, a visitor requesting 43 receives the correct canonical variant instead of the 42 offer.

### B. Structured equipment compatibility graph — migration 0452

Introduced **the first sport-class compatibility edge table** linked to existing `sport_knowledge_sources`, with `sport_code`, use-case, primary/secondary roles, subtype, relationship type, confidence, applicability, official source, and human-readable evidence excerpt. This table extends (does not replace) existing Sport & Fit normalized evidence and scoring.

Six curated/evidence-backed edges:

| Sport / scope | Primary → supporting | Relation | Evidence |
|---|---|---|---|
| Running / any | Footwear → socks | recommended_with | REI Expert Advice |
| Walking / any | Footwear → socks | recommended_with | REI Expert Advice |
| Hiking / any | Footwear → socks | recommended_with | REI Expert Advice |
| Gym / any | Footwear → socks | optional_with | REI Expert Advice |
| Football / **football_match** | Footwear → socks | **requires** | IFAB 2026/27 Law 4 |
| Football / **football_match** | Footwear → **shin guards** | **requires** | IFAB 2026/27 Law 4 |

**Sources:** [IFAB 2026/27 Law 4](https://www.theifab.com/laws/latest/the-players-equipment/); [REI guide to athletic, running, walking and hiking socks](https://www.rei.com/learn/expert-advice/socks.html).

The shin-guard edge is **subtype-specific** (`secondary_kind='shin_guards'`), so the current runtime does **not** recommend a generic accessory as a mandatory shin guard. It remains in the governed graph until exact product-subtype identification becomes available. IFAB competition equipment requirements do not mean a user is obligated to buy new items from this marketplace.

The table is relational and auditable, has restricted public access, RLS, constraints and an active-record lookup index. Two new `sport_knowledge_sources` records ground the six edges. No fictitious product-level manufacturer facts.

### C. Compatibility in recommendation output

A separate, cached, 128-edge-bounded PostgreSQL lookup reads active validated edges (300-second cache), independently of the 30-second vendor stock/product snapshot.

The recommendation engine accepts these edges as a third parameter. **Only** a kit item that was already technically eligible with positively governed product evidence receives an optional `kitCompatibility` record documenting the source, relationship, strength and selected secondary product. An edge cannot turn a generic unknown sock into a technically eligible match, cannot change Tier-1 ranking, and never infers model-level composition or fitting.

A known reviewed `incompatible_with` class relationship hard-excludes the affected secondary role even when other edges, price or scores would favor it.

### D. 3D Studio initial universe candidate distribution

**Bug:** the initial GET endpoint advertised `secondaryCount:0` for every vendor and sorted the entire stock-positive product pool by image/quantity. Hundreds of socks/apparel products could dominate the first 96 displayed icons.

**Fix:** returned counters reflect genuine canonical primary and secondary candidate counts. The initial universe displays stock-positive primary footwear first; a **maximum of 12 Tier-2 products** can appear in any 96-item preview. The POST recommendation already separates Top-5 footwear and Complete My Kit. Separate unit regressions cover 50 shoes + 300 socks and 105 shoes + 150 socks.

### E. CI and regression findings

The previous Sport Fit WebGL acceptance run had **102/103** tests passing; one failure was the longstanding expectation that documented incompatible *secondary apparel* remains browseable with reduced confidence, while the latest primary hard-exclusion logic had rejected it. Corrected so primary footwear conflicts remain hard; secondary apparel remains browseable with a conflict status, and is barred from final kit selection without positive governing proof.

Other global PR workflows were blocked by an unrelated default-branch SQL file named `db/migrations/20261015_research_thank_you_delivery_pause_guard.sql`, which violates the current four-digit filename integrity rule. **Do not modify or delete that research delivery safety guard as part of Sport & Fit.** Its migration coordination must be handled separately by the owning research workflow.

### SQL verification and safety

The checked-in **0448→0449→0450→0451→0452** migration chain was executed against the populated Supabase catalogue in one transaction that ended with **ROLLBACK**. All database guards passed; the new compatibility table produced **six** active sourced edges in the transaction. The 0452 SHA-256 checksum and runtime schema gate **452** are committed. No production tables or facts were changed.

Automated acceptance jobs for the final commit must pass separately before merge/deployment. The overall branch may remain blocked by unrelated default-branch migration integrity until reconciled.

### Recommended next batch

1. Implement reviewed **family/model-specific equipment subtypes**, especially shin guards and sport socks; then activate subtype-specific kit edges without title heuristic contamination.
2. Add manufacturer exact-size footprint width tables and resolve product-family/size-variant mapping inconsistencies.
3. Improve ranked footwear-family coverage under the 320-row vendor candidate cap for uncommon sizes, then benchmark SQL.
4. Expand sport-surface hard conflict tests (clay vs hard tennis, football FG/AG/Turf, mixed trail/road, wet and weather).
5. Increase evidence density for presently sellable court and hiking Tier-1 footwear; keep uncertainty explicit.

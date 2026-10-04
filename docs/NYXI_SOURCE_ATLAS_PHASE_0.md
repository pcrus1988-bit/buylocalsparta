# NYXI Phase 0 — Source Atlas

## Purpose

NYXI must know **where a fact came from, which jurisdiction and date it applies to, and which source version supported it** before it classifies a shade, formula, ingredient or safety status.

Phase 0 therefore builds the evidence substrate only. It deliberately does **not** turn source presence into product, ingredient, health or legal conclusions.

## Data flow

```text
research target
  -> source registry
  -> crawl/check state
  -> immutable source snapshots
  -> [later phase] extracted assertions
  -> [later phase] product/formula/regulation/recall knowledge graph
```

Raw HTML/PDF/JSON/CSV bodies should live in governed object storage. PostgreSQL keeps source identity, authority, hashes, effective dates and object keys.

## Governance rules

1. **Never collapse formula status to a brand.** A formula claim must eventually resolve to product/line/SKU, market, source version and effective/retrieval date.
2. **Never overwrite history.** Reformulations, discontinued products, superseded rules and old SDS files remain addressable.
3. **Legal authority is explicit.** Informative databases such as CosIng can aid discovery but do not replace binding legislation.
4. **Manufacturer evidence is primary for its own product formulation, not for legal interpretation.**
5. **Recall and adverse-event evidence stays distinct from formula evidence.** A recall can refer to a batch, market or product without defining every formula version.
6. **Conflicts are preserved.** Contradictory pages/SDS files are evidence to resolve, not rows to silently deduplicate.
7. **Unknown is a valid state.** NYXI should prefer an unresolved fact over an unsupported inference.
8. **Commercial independence is intentional.** NYXI brand research targets are not foreign-keyed to the KONTA MOY catalogue so the knowledge layer can later serve other stores and APIs.

## Phase-0 schema

- `nyxi_sources` — canonical source registry and authority metadata.
- `nyxi_source_snapshots` — versioned capture metadata, hashes and effective dates.
- `nyxi_source_crawl_state` — operational check/retry state, separate from evidence history.
- `nyxi_research_targets` — queue for brands, jurisdictions, ingredients, regulations, recall systems and scientific topics.
- `nyxi_source_target_links` — source-to-target coverage relationships without asserting extracted facts.

All tables have RLS enabled and are restricted to KONTA MOY application/platform runtime roles.

## Initial authoritative source set

The seed includes 23 verified primary sources spanning:

- EU: Cosmetics Regulation 1223/2009, Regulation 2025/877, CosIng, SCCS, ECHA CLH, Safety Gate.
- Great Britain: OPSS cosmetics guidance and product-safety alerts/recalls.
- United States: FDA MoCRA, cosmetics enforcement, complaints/adverse events.
- Canada: Health Canada Cosmetic Ingredient Hotlist and official recalls portal.
- Australia: AICIS cosmetic chemical regulation and ACCC recalls.
- Japan: MHLW cosmetics regulation and PMDA recalls.
- China: NMPA / IECIC regulatory source.
- Manufacturer evidence: The GelBottle SDS library, Aprés SDS library, Kiara Sky SDS library, OPI product/ingredient pages and essie product/ingredient pages.

## Brand research queue

The first 50 nail brands are seeded as independent research targets. OPI, essie, The GelBottle Inc, Aprés Nail and Kiara Sky begin in `in_progress`; the remainder stay queued until their source maps are discovered and verified.

## Next implementation pass

1. Add the source-fetch worker with conditional requests (ETag / Last-Modified), SHA-256 hashing and raw-object archival.
2. Discover each priority brand's official product indexes, regional sites, SDS/TDS libraries, catalogues/colour charts, reformulation notices and archived pages.
3. Capture recall/regulatory feeds on an appropriate cadence without converting alerts into global brand conclusions.
4. Only after source coverage is sufficient, add identity resolution and versioned assertion extraction.

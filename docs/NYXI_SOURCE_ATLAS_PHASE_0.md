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

Raw HTML/PDF/JSON/CSV bodies should live in governed object storage. PostgreSQL keeps source identity, authority, hashes, effective dates and object keys. A separate append-only check ledger preserves when each source was actually checked, even when the bytes were unchanged and therefore no new raw snapshot was necessary.

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
- `nyxi_source_candidates` — aggressively gathered URLs awaiting verification; discovery alone never promotes authority.
- `nyxi_source_candidate_snapshots` — immutable raw captures of candidate URLs, kept explicitly separate from verified-source evidence.
- `nyxi_source_candidate_checks` — append-only candidate retrieval history.

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

## Collection implementation

Phase 0 now includes `workers/nyxi-source-collector-worker.ts`.

The collector deliberately performs **no semantic product/formula analysis**. For every verified registered source it:

1. uses HTTPS-only, public-DNS-pinned acquisition with redirect revalidation;
2. sends conditional requests using retained ETag / Last-Modified values;
3. bounds response sizes and request duration;
4. hashes the exact received bytes with SHA-256;
5. stores changed raw bytes under the immutable content-addressed key
   `private/nyxi/source-archive/<source-id>/<sha256>.<ext>`;
6. records a versioned PostgreSQL snapshot containing retrieval/status/header provenance and the raw object key;
7. records no new snapshot when the source is unchanged;
8. never extracts ingredients, shade properties, legal conclusions or safety conclusions.
9. structurally extracts same-official-domain links from HTML/XML/sitemaps into `nyxi_source_candidates`, bounded by link/byte limits; these candidates remain unverified and are not automatically promoted.

A six-hour GitHub Actions schedule runs the source registry sync followed by the collector in bounded drain mode when repository secrets are configured.

## Growing the source universe

Further source discovery does not require database migrations.

- `data/nyxi/source-registry.json` contains manually verified primary sources.
- `npm run nyxi:sources:sync` idempotently upserts that curated registry and schedules new sources for capture.
- `nyxi_source_candidates` holds discovered-but-not-yet-verified URLs from searches, indexes, sitemaps, regulator listings or manufacturer links. The collector can populate this ledger from link structure alone; candidate discovery is explicitly not semantic analysis or authority promotion.

This distinction is intentional: NYXI can gather very broadly now while keeping the evidence bar high.

Candidate acquisition is deliberately more permissive than source verification but never changes authority. Once a URL is structurally discovered from a verified source, the collector may preserve its exact bytes under `private/nyxi/candidate-archive/<candidate-id>/<sha256>.<ext>`. Those captures are labeled `verifiedSource: false`, are not recursively crawled for more candidates, and are never promoted by the acquisition worker.

The next work is therefore **source discovery, not content interpretation**:

1. expand every priority brand to its official product indexes, regional sites, SDS/TDS libraries, catalogues, colour charts, technical manuals and reformulation notices;
2. register official regulator/recall feeds and historical archives;
3. preserve linked PDFs/JSON/CSV documents as independent sources when they are verified;
4. retain removed and superseded sources rather than deleting them;
5. only after source coverage is dense enough, introduce product identity resolution and versioned assertion extraction.

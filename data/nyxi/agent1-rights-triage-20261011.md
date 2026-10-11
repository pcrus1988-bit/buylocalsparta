# NYXI Agent 1 — remaining rights-review triage (2026-10-11)

Read-only derived from frozen `data/nyxi/source-governance-v1.json` on `governance/nyxi-atlas-first-asset-cohort-20261009`. This document is **not an approval** and must not be interpreted by acquisition workers as permission.

## Reconciliation
- Atlas: 303 unique source identities (282 registry v25 + 21 live-only).
- 71 entries have a rights-policy review decision; 232 entries remain `NOT_REVIEWED`.
- Unreviewed breakdown by source family: 153 manufacturer catalogues, 41 manufacturer roots, 3 authorised distributors, 8 historical archives, 2 retailers, 25 other official/scientific/regulatory families.
- Preserve exact source key, URL and UUID; no publisher-level merging. Canonicalization proposals require human identity review.
- Production has only three separately approved FDA exact assets, zero mirror approvals. Source-wide approvals remain zero.

## Human-review order
1. **P0 — legal/regulatory/safety:** 25 other official/scientific/regulatory records. Record authority, jurisdiction, effective/version date, document identity, applicable reuse terms, retention and per-asset acquisition/mirror decision. A government publisher is not blanket permission.
2. **P1 — first-party manufacturer catalogues (153):** prioritise official shade/colour catalogues and product-ingredient references. Verify exact asset, revision, language, image ownership, commercial reuse and derivative colour-data rights. Avoid assuming shade names or swatches can be mirrored.
3. **P1 — manufacturer roots (41):** use as discovery references only; require product-specific URL and explicit rights before acquisition.
4. **P2 — historical archives (8):** mark superseded/dated evidence; do not substitute for current SDS or regulation.
5. **P2 — distributors (3) and retailers (2):** validate first-party authority, licensing and original publisher. Never infer rights from resale listings.

## Separate SDS review (not additive to above 232)
Five targeted discovered records lack approval: `akzentz_luxio_base_hema_free_sds_2024`, `akzentz_luxio_base_sds_eu_2025`, `akzentz_luxio_build_sds_eu_2025`, `gellifique_sds_2019_pdf`, `cuccio_brush_builder_sds`. Verify exact document revision and manufacturer/product applicability; Cuccio URL is HTML. Neither an upload-folder date nor a source-key year proves SDS revision.

## Agent 2 hard gate
Use only an active, unexpired, exact-asset `nyxi_asset_acquisition_approvals` row matching source UUID and canonical URL; check acquisition and mirror flags independently. `active`/`discovered` registry status is never authorization. No new IDs approved in this triage.

## Validation / blockers
Counts checked against frozen JSON; production exact-asset approvals separately read-only checked. Human rights decisions and document inspection pending. Do not execute conflicting migrations 0435/0436, activate paused agents, or publish private evidence.

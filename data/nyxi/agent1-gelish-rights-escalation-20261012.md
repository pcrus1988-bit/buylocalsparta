# NYXI Agent 1 — Gelish / Morgan Taylor commercial-use rights escalation
**Review date:** 2026-10-12 (Europe/Athens). **Status:** human rights review required; no acquisition or mirroring approved.

## New primary-source evidence
The manufacturer site's [Terms and Conditions](https://gelish.com/terms) (reviewed 2026-10-12), under **Copyright** and **License and Site Access**, describe protected text, graphics, images, downloads and data compilations; they restrict site use to personal access, and prohibit commercial reuse, product-listing collection, data mining/robots and reproduction without express written consent. This is a restrictive rights signal, **not** a grant. Confirm current terms, contracting party and precise asset scope with legal/rights reviewer before any decision.

## Exact source identities to triage
| Source key | Canonical URL | Rights assessment |
| --- | --- | --- |
| `gelish_collections_index` | https://gelish.com/colors/collections | Main-site terms; written commercial-use permission required for proposed acquisition |
| `gelish_color_plus_all` | https://gelish.com/color-plus/all-colors | Same |
| `gelish_colour_catalogue` | https://gelish.com/colors/gelish | Same |
| `gelish_root` | https://gelish.com/ | Same |
| `gelish_system_page` | https://gelish.com/gelish | Same |
| `morgan_taylor_colours` | https://gelish.com/colors/morgan-taylor | Same; distinct Morgan Taylor product family |
| `morgan_taylor_system` | https://gelish.com/morgan-taylor | Same; do not merge with colours endpoint |
| `gelish_core_catalog_pdf` | https://o.gelish.com/pdf/5533-HNH-CORE-Catalog-UPDATE-LS-FNL3-UPD.lowres.pdf | Subdomain: verify separate asset ownership and applicability of main-site terms; no permission assumed |

## Human rights decision required
Obtain documentary evidence of (a) publisher/asset rights holder; (b) exact asset and version/revision; (c) scope for automated access, commercial extraction, derived shade/color data, storage and retention; (d) **separate** mirror/image redistribution permission; (e) reviewer identity, evidence URL, decision timestamp, review/expiry dates. Defaults: `acquisition_authorized=false`, `mirror_authorized=false`. No document or images were downloaded in this review.

**Deduplication:** Gelish and Morgan Taylor pages share a website but not necessarily a product line, formulation, asset, or license. The PDF is a distinct asset, not a duplicate of HTML pages. Preserve all eight keys and canonical URLs; only propose relationships for later human validation.

## Reproducible test
`data/nyxi/agent1-gelish-rights-gate-check-20261012.sql` was executed read-only against project `eemihhfreggbigxejjhj` on 2026-10-12: 8/8 matched unique source UUIDs and URLs; 8 discovered; 7 on main host and 1 on subdomain; **0 approval records**, **0 acquisition flags**, **0 mirror flags**. Agent 2: zero new acquisition IDs. The 3 previously approved FDA assets are unaffected.

**Change scope:** Governance documentation and regression SQL only. No database writes, rights grants, task activations, publication of private evidence, or migrations 0435/0436.

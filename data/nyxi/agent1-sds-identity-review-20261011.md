# NYXI Agent 1 — SDS identity and revision review packet

Date: 2026-10-11. Source: read-only `nyxi_sources` registry metadata in Supabase `eemihhfreggbigxejjhj`. **Metadata-only; no PDFs downloaded, no SDS contents asserted, no rights granted.**

| Source key | Registry product/variant | Registry geography | Endpoint kind | Human review concern |
|---|---|---|---|---|
| `akzentz_luxio_base_hema_free_sds_2024` | Luxio Base, HEMA-free | GLOBAL | PDF URL | Key says 2024; upload path says 2025/06. Neither establishes actual SDS revision. |
| `akzentz_luxio_base_sds_eu_2025` | Luxio Base | EU | PDF URL | Confirm whether distinct formula/variant from HEMA-free, document revision and jurisdiction. |
| `akzentz_luxio_build_sds_eu_2025` | Luxio Build | EU | PDF URL | Do not merge with Luxio Base; confirm exact product/formula and revision. |
| `gellifique_sds_2019_pdf` | Professional UV/LED Gel | GB (registry) | PDF URL | Metadata documentDate 2019-02; filename includes 20190411-3; historical/current applicability unknown. |
| `cuccio_brush_builder_sds` | LED/UV Brush-On Builder with Calcium | US | HTML page | Not a direct SDS PDF; locate exact manufacturer-authored SDS asset before considering acquisition. |

## Proposed human review fields (no permission inferred)
- `source_key`, immutable source UUID, canonical URL, publisher/manufacturer and originating domain.
- `asset_url` (exact document, distinct from catalogue/product page), MIME/type, product name, SKU/formula, variant, region/language.
- `document_issued_on`, `document_revised_on`, `document_version`, `supersedes`, `effective_market`; label each **unverified** until documentary evidence.
- `rights_evidence_url`, `rights_holder`, `permission_basis`, `permitted_uses`, `retention_until`, `review_due_at`, `expires_at`.
- Independent booleans `acquisition_authorized` and `mirror_authorized`, **both false by default**; reviewer identity, decision timestamp, reason and evidence reference.
- Before any approval, confirm commercial research, storage, extraction, derivative data and mirroring rights separately.

## Deduplication rules
- Preserve five distinct source keys and endpoints. Same brand or product family does **not** imply same formulation, document or permission.
- Compare document hash, official revision, exact product and region only after independently authorized acquisition. Until then, mark *possible relationship*, not canonical duplicate.
- Historical SDS is evidence of a past revision only after verification; do not present as current safety advice.

## Gate / tests
Live read-only query returned five records with family `manufacturer_sds`; four URLs end in `.pdf`, one Cuccio URL is an HTML page. Prior join found zero asset-approval records for all five. **Agent 2: 0 new authorized assets.** Do not fetch or mirror these files. Human review and conflicting migrations 0435/0436 remain blockers.

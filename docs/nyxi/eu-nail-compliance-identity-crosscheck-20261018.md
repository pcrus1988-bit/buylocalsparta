# NYXI — Chemical identity and EU nail compliance reconciliation
Production: `eemihhfreggbigxejjhj`, 18 October 2026.

## Verified additions

The privately archived and SHA-verified originals now include:
- **EU 2020/1682** (Annex III entries 313 and 314): HEMA and Di-HEMA Trimethylhexyl Dicarbamate in nail products are restricted to professional use, with warnings. From 3 June 2021 nonconforming products could not newly be placed on the EU market; from 3 September 2021 such products could not be made available. Official: https://eur-lex.europa.eu/eli/reg/2020/1682/oj/eng
- **EU 2025/877** (Annex II 1731, Annex III 311 deleted): TPO prohibited in cosmetics from 1 September 2025. Official: https://eur-lex.europa.eu/eli/reg/2025/877/oj/eng
- **European Commission TPO Q&A** (7 August 2025): explains effects on old stock, professional nail technicians, and commercial supply. This is explicitly nonbinding interpretation by the Commission services. Official: https://single-market-economy.ec.europa.eu/sectors/cosmetics/tpo-nail-products-questions-answers_en
- **EU 2026/78** (general cosmetics CMR amendment effective 1 May 2026) separately added to registered sources and approved for exact-asset archival. Do not infer that it reclassified HEMA or TPO without independent document analysis. Official: https://eur-lex.europa.eu/eli/reg/2026/78/oj/eng

The source registry and exact-asset authorizations were applied separately to production with review expiry and individual rights provenance. Re-running source registration only **never** authorizes capture. No bulk crawler, linked document or third-party image permissions were granted.

## Private data model

The production migration `20261018200200_nyxi_private_chemical_identity_assertions_20261018` creates a strictly private, service-role-only RLS table with 11 exact CAS/EC/INCI identifiers and immutable archived-fragment references for HEMA, Di-HEMA and TPO. Values include both Di-HEMA CAS numbers and their EC numbers, not a forced single-SKU chemical identity.

The migration `20261018200552_nyxi_private_regulatory_classification_matrix_v1` adds a service-role-only `security_invoker=true` view:
- HEMA / Di-HEMA: `PROFESSIONAL_USE_ONLY_CANDIDATE`
- TPO: `PROHIBITED_CANDIDATE`

The matrix explicitly sets `review_status=PENDING_INDEPENDENT_REVIEW`, `publication_authorized=false` and `product_specific_composition_known=false`. Six new private pending proposals supplement the two prior TPO 2025 legislative entries, totaling eight.

## Validation and safeguards

- Every identity row comes from a complete, exact-asset-authorized, SHA-matching, private EU legislative fragment, and a database trigger checks exact identifier appearance in its source text.
- CAS/EC identifiers are cross-checkable against PubChem [HEMA CID 13360](https://pubchem.ncbi.nlm.nih.gov/compound/13360), [TPO CID 166480](https://pubchem.ncbi.nlm.nih.gov/compound/166480), [Di-HEMA / UDMA CID 170472](https://pubchem.ncbi.nlm.nih.gov/compound/170472). These external links are **identity review references**; their contributed annotations have NOT been archived or copied, and the Di-HEMA isomer grouping needs specific review.
- Verify source rights/approval freshness, actual current consolidated Annex amendments, and both source and ingredient identities before releasing any dated legal interpretation.
- The source fragments alone say nothing about a particular manufacturer's gel formula, batch concentration, product label, actual retail stock or market authorization.
- Don't equate TPO-free, HEMA-free, vegan, hypoallergenic, or 12-free claims with proven safety/compliance. Claims require formula + variant + evidence.
- No `nyxi_regulatory_facts`, `nyxi_search_documents_v1` or `nyxi_fragment_publication_approvals` are created by these migrations/seeds.
- Public `anon` and ordinary `authenticated` roles have no SELECT on the identity table or regulatory matrix.

## Review UI and continued work

The connected private NYXI Research Workbench has separate **Chemical Identity QA**, **EU Regulatory Matrix**, **Regulatory Proposals**, **Ingredient QA Evidence**, and source-intake tabs. Evidence copied to Workbench is metadata only, not copyrighted original documents.

Remaining next steps:
1. Independent review of complete 2020, 2025 and 2026 EU legislation and the current consolidated Cosmetics Regulation before promoting a binding legal fact.
2. Acquire permitted current INCI/SDS/brand-line-variant source assets with specific license/permission, not wholesale manufacturer site scraping.
3. Build source-grounded `ingredient → product family → exact formula/SKU` graph with per-product proof, and separate shade HEX/OKLab measured rather than guessed.
4. Expose a search API only after the existing two-person/asset-specific publication gates have passed.

## Production verification queries

```sql
SELECT label, proposed_eu_category, pending_count, publication_authorized
FROM public.nyxi_private_nail_regulatory_matrix_v1 ORDER BY label;
SELECT identifier_type, count(*) FROM public.nyxi_ingredient_identity_assertions_v1 GROUP BY 1;
SELECT (SELECT count(*) FROM public.nyxi_regulatory_facts) facts,
 (SELECT count(*) FROM public.nyxi_search_documents_v1) public_documents;
SELECT has_table_privilege('anon','public.nyxi_private_nail_regulatory_matrix_v1','SELECT') anon_allowed;
```

The two SQL seed scripts are idempotent and keyed to the exact original source fragments, not global string matching across the entire 306-source registry.

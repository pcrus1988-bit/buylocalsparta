# NYXI SCCS private ingredient candidate extraction (2026-10-18)

Production project: `eemihhfreggbigxejjhj`. Existing approved and SHA-verified PDF evidence is the **only** input to this backfill. The operation is intentionally separate from publication, product catalog matching, safety classifications, regulatory decisions and marketing claims.

## What was done

1. Three private ingredient nodes were added to `nyxi_entities`: 2-hydroxyethyl methacrylate (HEMA), Di-HEMA Trimethylhexyl Dicarbamate, Trimethylbenzoyl diphenylphosphine oxide (TPO). CAS identifiers are **candidates awaiting independent verification**, not a completed canonical ingredient registry.
2. The idempotent script `scripts/nyxi/seed-sccs-ingredient-mentions-v1.sql` inserts 197 distinct source-linked `candidate_mention` records from three SCCS originals. Each link carries fragment, snapshot checksum, source key, page number, `review_status=pending`, and `not_for_publication=true`. A repeat execution yielded **no duplicate records**.
3. Quality triage: 130 references have a matching term after the first 240 chars of their fragment (`body_context_present`), 66 have only an early match (`header_only_possible`), and 1 needs a pattern review. Because SCCS report running headers repeat on multiple pages, neither 197 matches nor 130 body-context matches should be counted as independent scientific conclusions.
4. Private, `security_invoker=true` views: `nyxi_private_ingredient_review_queue_v1` exposes a 700-character review-only excerpt plus original provenance references to service-role reviewers; `nyxi_private_ingredient_summary_v1` groups QA counts across original source documents. No view can be selected by `anon` or ordinary `authenticated` roles.
5. A private <https://docs.google.com/spreadsheets/d/1dgAmsq_bA662vjZEFsNc4Q8Tg8ugi5SWQODkVMTCkW8/edit> research Workbench has **Ingredient QA Summary** and **Ingredient QA Evidence** tabs with counts, source/page/fragment IDs, source checksums and review status. It does **not** mirror the original PDF bytes or text excerpts.

## Necessary review before knowledge publishing

- Verify the identity/CAS mappings against a contemporary authoritative chemical registry and relevant INCI listing.
- Read and annotate scientific opinion text beyond snippets, distinguish historical conclusions and study limitations, and validate exact nail-product context.
- Determine current EU/UK/other jurisdiction legal effect using the live underlying regulations, not solely a 2014 or 2018 SCCS opinion.
- Independently approve each source asset and fragment under the existing NYXI reviewer/publication gates.
- Verify ingredient/formula/brand/variant relations using actual product ingredients or permitted SDS/INCI product data; a mention in SCCS is **not** evidence a given nail gel contains the ingredient.
- Shade approximation and catalogue linking require separate calibrated swatches, brand/line/variant provenance and stock feeds; this extraction does not solve those.

## Verification SQL

```sql
SELECT ingredient_candidate, mention_fragments, source_pages, body_context_fragments,
 header_only_possible,pattern_review FROM public.nyxi_private_ingredient_summary_v1;
SELECT (SELECT count(*) FROM public.nyxi_entities) AS entities,
 (SELECT count(*) FROM public.nyxi_entity_evidence) AS links,
 (SELECT count(*) FROM public.nyxi_regulatory_facts) AS approved_or_candidate_regulatory_facts,
 (SELECT count(*) FROM public.nyxi_search_documents_v1) AS public_index_documents;
SELECT has_table_privilege('anon','public.nyxi_private_ingredient_review_queue_v1','SELECT') AS anon_access,
 has_table_privilege('service_role','public.nyxi_private_ingredient_review_queue_v1','SELECT') AS worker_access;
```

Expected production observed on 18 October 2026: 11 total entities (8 prior, 3 new), 209 entity-evidence links (12 prior, 197 new), **zero regulatory facts and zero search documents**. The migration is already applied as version `20261018190536`; the SQL file here tracks exact production behavior. Existing anonymous/reviewer rights are unchanged.

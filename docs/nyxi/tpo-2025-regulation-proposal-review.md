# NYXI — TPO current regulation cross-check, private proposal stage (18 October 2026)

The NYXI corpus contains a 2014 SCCS TPO scientific opinion (source `eu_sccs_tpo_2014_pdf`) and the subsequently enacted Commission Regulation (EU) 2025/877 (`eu_regulation_2025_877`). The difference matters: a 2014 safety evaluation or historical professional-use exception is **not** an authority for current 2026 sale or use.

Official legislative reference: https://eur-lex.europa.eu/eli/reg/2025/877/oj/eng

## What was actually implemented

- Two **nonpublic regulatory proposals**, tied to exact archived HTML fragment IDs, official EUR-Lex URL, original source SHA-256 and proposed effective date 1 September 2025:
  1. Annex II entry 1731 names diphenyl(2,4,6-trimethylbenzoyl)phosphine oxide (TPO), CAS 75980-60-8, among prohibited cosmetic substances.
  2. Annex III entry 311 (previous restricted professional artificial-nail-use entry) is removed.
- `nyxi_regulatory_proposals_v1` is a dedicated staging table because `nyxi_regulatory_facts.is_current` is mandatory. No unknown current legal status is falsely written as `is_current=true` or `false`.
- The database trigger requires exact source/snapshot/fragment identity, valid immutable SHA, complete private extraction and active asset approval; anonymous and ordinary authenticated roles cannot read or write this table.
- `nyxi_private_regulatory_proposal_queue_v1` is service-role-only; pending legal proposals are not returned by NYXI public search, and do not create public evidence publication approvals.
- A new metadata-only **Regulatory Proposals** tab is available in the private [Research Workbench](https://docs.google.com/spreadsheets/d/1dgAmsq_bA662vjZEFsNc4Q8Tg8ugi5SWQODkVMTCkW8/edit#gid=1708302260); no original document bytes or private excerpt copied to Drive.

## Required before promoting a candidate to a validated legal fact

- Independently review authenticated Official Journal regulation text, entry 1731, deletion of 311, and Article 2 application date.
- Check the **consolidated** Regulation (EC) No 1223/2009 as of the intended answer date for corrections, transition rules, amendments and local enforcement context; do not conflate substance law with the ingredient list of a specific SKU.
- Verify chemical identifiers against a contemporary authoritative identity registry, and manufacturer-specific composition against an approved SDS/INCI source for that exact line/batch.
- Record reviewer identity, reviewer decision, timestamp and asset/fragment publication authorization through the separate NYXI independent publication workflow.
- Only then create a dated and source-cited `nyxi_regulatory_facts` record and publish a carefully scoped claim. Neither the private proposal nor an automated agent decision alone is sufficient.

## Observed production verification

On 18 October 2026: 2 private pending TPO proposals, 0 validated `nyxi_regulatory_facts`, 0 public search documents, 0 fragment publication approvals. Both proposals read back with their original archived primary fragment, EU instrument, proposed effective date and `requires_consolidation_review`. Their SQL seeds are idempotent via unique `proposal_key`.

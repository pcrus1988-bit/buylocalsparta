# NYXI Corpus Foundation

## Canonical source authority

NYXI source definitions now have one authority:

- `data/nyxi/source-registry.json`
- registry version: **25**
- updated: **2026-10-07**
- current unique configured sources: **282**

The previously reported 283-source total was corrected during reconciliation. The live branch contains 251 registry entries plus 34 historical migration seeds with **3**, not 2, overlaps: `jp_mhlw_cosmetics`, `cnd_sds`, and `cnd_product_profiles`. The 31 migration-only records were absorbed into registry v25. Source definitions are no longer seeded by NYXI migrations.

## Canonical migration line

This branch is stacked on the governed Retail Observatory schema head **0434**.

NYXI adds:

- **0435** — canonical corpus foundation: source registry tables, immutable source/candidate snapshots, retrieval ledgers, crawl state, research targets, RLS and append-only runtime permissions.
- **0436** — `nyxi_corpus_manifest` plus direct builder workbench views.

The runtime schema gate is **0436**.

## Corpus access model

### Structured database

- `nyxi_sources`
- `nyxi_source_snapshots`
- `nyxi_source_checks`
- `nyxi_source_crawl_state`
- `nyxi_source_candidates`
- `nyxi_source_candidate_snapshots`
- `nyxi_source_candidate_checks`
- `nyxi_research_targets`
- `nyxi_source_target_links`

Derived builder access:

- `nyxi_corpus_manifest`
- `nyxi_workbench_sources`
- `nyxi_workbench_snapshots`
- `nyxi_workbench_review_queue`

### Immutable raw evidence

Supabase Storage bucket:

- bucket: `nyxi-evidence`
- private: yes
- current per-object limit: 25 MiB
- verified source prefix: `private/nyxi/source-archive/`
- candidate prefix: `private/nyxi/candidate-archive/`

Objects are content-addressed by SHA-256 and the runtime evidence tables are append-only for collector roles. A new source version creates a new object/snapshot rather than replacing historical evidence.

### Google Drive research mirror

The human/research mirror is rooted at the Drive folder `NYXI`.

Folder IDs and the storage location contract are recorded in:

- `data/nyxi/workbench-locations.json`

The Drive mirror is not the authoritative evidence store. It is for important PDFs, catalogues, shade charts, SDS/TDS documents, regulatory material, recall evidence, extraction reports, and review queues.

## Current boundary

This foundation still performs **no product/shade categorisation, formula interpretation, ingredient classification, safety conclusion or regulatory conclusion**.

The next execution block is:

1. port the immutable collector onto this canonical branch;
2. add a guarded schema rollout after the Research 0434 line is accepted;
3. sync registry v25 into `nyxi_sources`;
4. fetch and archive the first complete reachable corpus into `nyxi-evidence`;
5. record retrieval outcomes and expose coverage through the corpus manifest/workbench.

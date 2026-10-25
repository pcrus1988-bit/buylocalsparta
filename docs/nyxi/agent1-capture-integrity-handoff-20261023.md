# NYXI Agent 1 — archived-asset integrity and publication-rights HOLD

Production read-only checkpoint: **2026-10-23 08:18 Europe/Athens**.
Supabase project: `eemihhfreggbigxejjhj`. Source registry baseline on 11 Oct: 303; current: **310** distinct source keys and canonical URLs.

## Verified database metadata (not original-byte attestation)

| Measure | Current | Delta from 07:25 checkpoint |
| --- | ---: | ---: |
| Registered sources | 310 | 0 |
| Private archived snapshots | 213 | 0 |
| Private fragments | 2,668 | 0 |
| Acquisition approvals | 50 | 0 |
| Extraction runs | 207 | 0 |
| Publication approvals | 0 | 0 |
| Public search documents | 0 | 0 |

Across 213 snapshots: 0 missing acquisition-approval bindings; 0 source-identity mismatches; 0 approved-final-URL mismatches; 0 malformed recorded SHA-256 strings; 0 nonpositive recorded byte lengths. **Original private Storage bytes were not accessible for independent hashing in this run.**

## Priority exact-asset Agent 2 handoff

Each tuple is `snapshot UUID | source UUID | approval UUID | recorded SHA-256 | byte length`. Storage bucket `nyxi-evidence`; path is `<source UUID>/<SHA-256>/safety-gate.html` for Safety Gate and `<source UUID>/<SHA-256>/pdf.pdf` for the Australian PDF.

1. `d312a607-c9bb-44de-b6c8-20c9406484ca | 870fbcd2-c415-4e80-8879-65147b89ddb0 | 3dd99cbc-8c88-4172-a3e4-5a76f78c3b82 | 53edeb754848e26967006f2e4989d125449d2edae336feb0d5ad8b2e0dd22cad | 103975`
2. `e897f7d6-65e8-4bc3-a24f-32132eb48bd1 | 870fbcd2-c415-4e80-8879-65147b89ddb0 | 3dd99cbc-8c88-4172-a3e4-5a76f78c3b82 | 41956e2f517b050b8ed126dcd9bd69d3983f600007d6879b939e12d2384e4f41 | 103976`
3. `70c43b90-cfd9-4758-b6fc-f85bd4df98d6 | 870fbcd2-c415-4e80-8879-65147b89ddb0 | 3dd99cbc-8c88-4172-a3e4-5a76f78c3b82 | 22e7f461de51f275351d36f2a1139236081644ccd78cf864c9822f3726cf6d7e | 103976`
4. `16c6d4c7-9c22-4aa4-9ad3-9bfc1f37cfb3 | 870fbcd2-c415-4e80-8879-65147b89ddb0 | 3dd99cbc-8c88-4172-a3e4-5a76f78c3b82 | 96e776fa24bf3c393cf58427f7e4ee7866265fa4a851125150cebd380ec3a43e | 103975`
5. `0dca0ce8-88d3-45d7-8a8b-7138c5c98d83 | 870fbcd2-c415-4e80-8879-65147b89ddb0 | 3dd99cbc-8c88-4172-a3e4-5a76f78c3b82 | cab87fa09bb2bfcccaea1c415496b2c8e2e729e1e920b058cbccfe2cb7b84404 | 103930`
6. `13ec68ac-33af-40a9-8813-665d608e86dc | 0425acc9-5599-49b4-80ee-71b12756085c | b8bfb606-709f-4112-b12c-068ed01a6854 | 63cd30ae6b8ecad1503f664e69874ff601f83108f9531bd7caed528a30daebf0 | 2463436`

All six lack an extraction run. Five are Safety Gate HTML; one is Australian Poisons Standard PDF. **Do not alter parser statuses by inference.** Independently retrieve original bytes under authorized private access, recompute SHA-256 and length, verify exact asset URL and approved capture time, and record a separate immutable attestation.

## Agent 4 rights and release gate

Three FDA acquisition approvals have no `retention_until`, affecting **98** snapshots: Restricted Ingredients 36, Nail Care 34, MoCRA 28. All 50 approvals lack a recognized independently archived documentary-rights SHA-256 anchor. Missing `no_public_release` is not permission to publish.

The owner's 22 Oct standing policy permits automatic **private** processing, not third-party publication rights. The new module verifies identities and optionally original bytes and independent policy-byte anchors. It **always** returns `publication_authorized: false` and does not write to `nyxi_fragment_publication_approvals`. Any public release requires a separately implemented and audited rights-aware release contract. Unclear rights are held for rights-owner or qualified human determination; never self-grant.

## Test command

`node --test scripts/nyxi/governance/archived-asset-integrity.test.mjs`

The test suite contains 21 synthetic cases; do not claim tests passed until the exact committed files have executed in CI or a Node runtime. No production writes, acquisition expansion, or public fragment publication in this checkpoint.

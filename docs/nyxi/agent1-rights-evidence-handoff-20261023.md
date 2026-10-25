# NYXI Agent 1 — documentary-rights evidence handoff (2026-10-23, 17:16 Athens)

**Scope:** private source-governance metadata only. **Publication: HOLD.**
This file is engineering documentation, not an acquisition approval, license,
original-byte attestation, independent witness, or publication decision.

## Verified read-only production inventory
Supabase project `eemihhfreggbigxejjhj`:
- Registered sources: **310** (original 303 baseline).
- Archived snapshots: **220**; private fragments: **2,719**; extraction runs: **214**.
- Acquisition approvals: **50**; active publication approvals: **0**; active reviewers: **0**.
- Snapshots with no extraction run: **6**.
- Duplicate recorded snapshot SHA-256 groups: **0**.
- Snapshot binding audit across 220: **0** missing source/approval bindings, URL mismatches, historical capture authorization violations, missing private Storage catalog objects, malformed recorded hashes/byte lengths or invalid content-addressed Storage paths.
- Three FDA approvals lack `retention_until`: `212bf852-ea98-4772-840c-78dfd36ffd50` (36 snapshots), `4a2c89da-f9bf-4850-a211-13c4ddf42919` (35), `36188f3a-32ee-42a0-8b85-6ce6cc0f0dc6` (29); **100 affected**.
- Acquisition metadata with recognized `rights_policy_sha256`: **0/50**.

These checks concern recorded database and Storage *catalog* metadata. The original
private Storage bytes were **not independently downloaded and hashed** here.

## New code (draft PR #1756)
`scripts/nyxi/governance/documentary-rights-evidence.mjs` hashes exact
authorized rights-policy document bytes supplied by a privileged server-side
reader and emits a frozen, metadata-only review observation. It enforces the
existing snapshot/acquisition binding, exact approved HTTPS policy URL,
chronology, byte-size limit, and mismatch rejection against any previously
recorded policy-document SHA-256.

It always emits `publication_authorized:false`,
`rights_review_required:true`, `independently_archived:false`, and
`independent_rights_review_complete:false`. It does **not** fetch external
URLs, grant rights, write to production, or create a cryptographic witness.

**GitHub Actions:** run 39968652798, **121/121 tests passed** (16 new).

## Agent 2: six original-byte/extraction exceptions
Each line is snapshot UUID | acquisition UUID | recorded SHA-256 | byte length.
1. `0dca0ce8-88d3-45d7-8a8b-7138c5c98d83` | `3dd99cbc-8c88-4172-a3e4-5a76f78c3b82` | `cab87fa09bb2bfcccaea1c415496b2c8e2e729e1e920b058cbccfe2cb7b84404` | 103930
2. `13ec68ac-33af-40a9-8813-665d608e86dc` | `b8bfb606-709f-4112-b12c-068ed01a6854` | `63cd30ae6b8ecad1503f664e69874ff601f83108f9531bd7caed528a30daebf0` | 2463436
3. `16c6d4c7-9c22-4aa4-9ad3-9bfc1f37cfb3` | `3dd99cbc-8c88-4172-a3e4-5a76f78c3b82` | `96e776fa24bf3c393cf58427f7e4ee7866265fa4a851125150cebd380ec3a43e` | 103975
4. `70c43b90-cfd9-4758-b6fc-f85bd4df98d6` | `3dd99cbc-8c88-4172-a3e4-5a76f78c3b82` | `22e7f461de51f275351d36f2a1139236081644ccd78cf864c9822f3726cf6d7e` | 103976
5. `d312a607-c9bb-44de-b6c8-20c9406484ca` | `3dd99cbc-8c88-4172-a3e4-5a76f78c3b82` | `53edeb754848e26967006f2e4989d125449d2edae336feb0d5ad8b2e0dd22cad` | 103975
6. `e897f7d6-65e8-4bc3-a24f-32132eb48bd1` | `3dd99cbc-8c88-4172-a3e4-5a76f78c3b82` | `41956e2f517b050b8ed126dcd9bd69d3983f600007d6879b939e12d2384e4f41` | 103976

Agent 2 must use exact authorized private Storage objects, verify actual bytes,
and separately witness resulting provenance; no public mirroring.

## Agent 4: independent review gate
Treat all policy-document observations as **uncleared**. A matching SHA-256
only proves the supplied bytes match the digest; it does not prove the
policy's applicability, rights holder, reuse scope, third-party exclusions,
retention deadline, attribution, or permission to publish fragments.

Require documentary original-byte archive, externally protected provenance
root, independent rights reviewer, separate fragment reviewer, exact
snapshot/fragment digest binding, revocation and deny-by-default search gate.
Undecidable cases remain for human adjudication. No private fragments should
be indexed or published from this handoff.

## Deployment
Draft PR #1756 is unmerged and undeployed. No production database writes,
rights grants, or private-fragment publication by Agent 1 in this run.

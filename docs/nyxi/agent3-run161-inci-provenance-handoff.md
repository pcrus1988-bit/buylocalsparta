# NYXI Agent 3 — INCI evidence handoff (2026-10-19)
Private-only implementation. This is not a review approval or authorization to publish.

## Changes
- `scripts/nyxi/private-inci-label-evidence-audit.mjs`: strict source-scoped candidate-to-snapshot-to-fragment INCI label-transcription ancestry and aggregate disagreement detection.
- `scripts/nyxi/private-inci-label-evidence-audit.test.mjs`: 33 deterministic regression tests for valid private output, cross-source rejection, SHA metadata mismatch, malformed input, forged approval fields, duplicate ordinal and cross-snapshot disagreement.
- Hash comparisons validate supplied metadata only; the module does not inspect archived bytes or independently authenticate a source.

## Agent 2 — extraction handoff
- Review source-specific acquisition rights before retrieving manufacturer-linked sources; do not reuse approvals from unrelated sources.
- Preserve immutable source, snapshot, fragment and digest lineage, including original bytes when authorized.
- Reconcile 11 existing ingredient identity assertions against authorized evidence; do not infer manufacturer formulas or release private excerpts.

## Agent 4 — independent review handoff
- Independently run the new regression tests and negative tests for malicious objects, forged approvals and cross-source references.
- Review RLS, privileged access, anonymous access, revocation, search/document publication and audit trail.
- Confirm no self-approval, no unreviewed content in public search, and no unsupported safety/compliance claims.
- Keep PR in draft until independent review and repository CI pass.

## Production snapshot (read-only, 2026-10-19)
Sources 310; snapshots 129; private fragments 2,073; ingredient identity assertions 11; publishers 63; candidate product lines 17; publisher-source links 224. Publisher-linked archived snapshots 0; publisher-linked authorized acquisition assets 0; shades 0; physical shade measurements 0; reviewer records 0; publication approvals 0.

No database writes, unauthorized acquisition or publication were performed as part of this handoff.

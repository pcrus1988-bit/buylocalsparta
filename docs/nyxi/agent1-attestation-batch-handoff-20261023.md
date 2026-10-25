# NYXI Agent 1 — attestation batch handoff (2026-10-23, 16:22 Athens)

## New code in draft PR #1756
- `scripts/nyxi/governance/attestation-batch-plan.mjs` creates deterministic, metadata-only plans for **trusted server-side Agent 2** workers. It validates exact historical source/approval/snapshot bindings using `observe()`, caps batches at 1,000, rejects oversized archives and contradictory duplicate snapshot identities, and retains distinct provenance for separate snapshots even when bytes share a digest.
- `scripts/nyxi/governance/attestation-batch-plan.test.mjs` adds 14 synthetic regression tests. All **105/105** tests passed in GitHub Actions run 39961014198.
- Plans explicitly set `original_bytes_verified: false`, `publication_authorized: false`, `rights_review_required: true`. No private Storage path, source text or original bytes are returned. Plans are not attestations, publication permissions or independent evidence of rights.

## Production read-only audit
Supabase project `eemihhfreggbigxejjhj`: 310 registered sources (historical 303 baseline), 220 archived snapshots, 2,719 private fragments, 214 extraction runs, 50 acquisition approvals and **0 publication approvals**. No changes from the previous 15:28 checkpoint. All 220 recorded snapshots had an acquisition binding, source and approved URL agreement, historical authorization-window agreement, valid recorded SHA-256 and a Storage catalog entry. 220 distinct recorded snapshot hashes. These are **catalog checks only**, not independent original-byte attestations.

Six snapshots still have no extraction run. Five are European Commission Safety Gate HTML captures of the same source; one is an Australian Federal Register of Legislation PDF. Agent 2 must use exact snapshot IDs, approval IDs, digests and byte lengths and independently load metadata from the authoritative database before invoking the private Storage bridge.

Three FDA acquisition approvals have no retention deadline and affect 100 snapshots. All 50 acquisition approvals have policy URLs but none have a recognized independently archived `rights_policy_sha256` in approval metadata. Agent 4 must treat these as **rights-review HOLD**, not as a publication license.

## Boundaries
No production database writes, public releases, new acquisition grants, or original-byte production attestations were performed. This draft does not implement protected immutable production storage, an independent signing witness, or legal rights clearance. A successful SHA-256 check never confers publication rights. Do not merge or deploy until the independent reviewer gate and operational controls are ready.

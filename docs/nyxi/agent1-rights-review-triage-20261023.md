# NYXI Agent 1 — independent rights-review triage (2026-10-23 18:14 Athens)

## Scope and security boundary

`scripts/nyxi/governance/rights-review-triage.mjs` builds a deterministic **metadata-only HOLD queue** from registered sources, acquisition approvals and exact archived snapshot records. It reuses the fail-closed acquisition-binding validator from `attestation-ledger.mjs`. It deduplicates identical snapshot records, rejects contradictory identities (including substituted private object paths), and preserves distinct snapshot IDs when hashes match. It never fetches or emits private bytes, excerpts, policy URLs or Storage paths. A caller's claimed rights flag cannot clear the HOLD. This is preparation for an independently authorized human reviewer, **not** publication approval or a production deployment.

## Fresh read-only production inventory

Supabase `eemihhfreggbigxejjhj` at this checkpoint: **310 sources** (the earlier 303 baseline is historical), **220 snapshots**, **2,719 private evidence fragments**, **214 extraction runs**, **50 acquisition approvals**, **0 publication approvals**, **0 active reviewers**. The existing six unextracted snapshots are in `manual_review_required`.

Recorded snapshot metadata audit: 0 missing approval bindings; 0 source/URL mismatches; 0 capture-window violations; 0 invalid private Storage catalog path prefixes; 0 malformed SHA-256 or byte lengths; 0 duplicate recorded SHA-256 groups. These are **database metadata checks only**. Original private bytes were not independently rehashed in this run.

Rights gaps: all 50 acquisition approvals have a policy URL but lack recognized `metadata.rights_policy_sha256` documentary anchors. Three FDA acquisition approvals have no `retention_until`, impacting 100 archived snapshots. No rights were inferred from an approval, URL, or recorded digest.

## Required handoffs and release controls

- **Agent 2 / issue #1460:** independently read authorized private Storage bytes for the six exact outstanding snapshot IDs, recompute SHA-256 and byte length, and create externally witnessed provenance. Do not mirror or publish.
- **Agent 4 / issue #1444:** triage documentary rights and retention, require independently authorized reviewer identities and explicit scoped permission; enforce revocation and fragment/snapshot identity in the protected production gate.
- **Agent 1:** obtain independently archived policy-document bytes and independently anchored evidence. Escalate undecidable rights to humans. Do not self-approve.

Draft PR #1756 remains unmerged and undeployed. Publication remains **HOLD**. No production writes, acquisition grants or private-fragment publication by Agent 1.

# NYXI Agent 1 provenance observation chain

Metadata-only, fail-closed archive observations for Agent 2 original-byte verification and Agent 4 rights triage. `catalog_observed` is **not** an original-byte attestation. `original_bytes_verified` requires original private Storage bytes and validates SHA-256, byte length, exact source/acquisition identity, historical capture authorization and content-addressed private path. `rights_review_hold` records an unresolved reason. Events never contain source text, original bytes or private Storage paths and always set `publication_authorized=false`.

The SHA-256 chain is tamper-evident **only when the root is independently pinned in a separate trust domain**. It is not production immutable storage, an independent rights signature, a publication grant or an ACL. Do not infer licensing from a matching archive hash. Future production use needs a separately controlled append-only/WORM sink, writer identity, retention policy, and independent root anchoring.

No Supabase writes or production original-byte attestations are part of this PR. 310 source registrations and 214 snapshots were read-only audited on 23 October 2026, with 0 publication approvals. The three FDA approvals with missing retention deadlines affect 99 snapshots. All 50 acquisition approvals lack recognized independently archived rights-document hashes. Keep PR draft and private evidence private until the independent reviewer gate is satisfied.

Run: `node --test scripts/nyxi/governance/attestation-ledger.test.mjs`.


## 23 October 2026 — externally pinned checkpoint continuity

`checkpoint-continuity.mjs` verifies a **new, independently signed** Ed25519 witness checkpoint against a **previously and independently pinned** witness anchor. It rejects replay of the old checkpoint, a truncated/reordered chain, altered historical prefix, wrong witness/key fingerprint, malformed anchor fields and nonmonotonic witness timestamps. The previous anchor must originate from a separate authenticated trust domain; do **not** accept it from the checkpoint, the database, the branch or a source page. `checkpointAnchor()` only constructs a candidate; it does not verify the signature or independently pin the anchor. External key custody, monotonic witness counters, storage retention and actual WORM storage are still not implemented.

This continuation check never sets publication permission and never authorizes rights. It is **not** protection against a compromised witness signing conflicting successors, a stolen external anchor store, or a legitimate independent reviewer decision. It also cannot independently read original Supabase Storage bytes.

Fresh read-only database checkpoint (23 Oct ~13:18 Athens): 310 registered sources, **218** private snapshots, **2,707** private fragments, **212** extraction runs, 50 acquisition approvals, 0 publication approvals, 0 active reviewers and 0 public search documents. Three new UK OPSS source snapshots were acquired by the existing authorized collector since the 215-snapshot checkpoint. Six snapshots still lack extraction runs. Three FDA approvals without retention deadlines affect 100 snapshots. All 50 acquisition approvals lack a recognized rights-document SHA-256 in acquisition metadata. All 218 snapshot records have matching acquisition identity, authorized capture window, exact approved final URL, private Storage catalog entry and content-addressed path; zero duplicate recorded snapshot hash groups. These are **metadata-only** checks; no independent original-byte attestation was completed.

Run all suites: `node --test scripts/nyxi/governance/attestation-ledger.test.mjs scripts/nyxi/governance/witness-checkpoint.test.mjs scripts/nyxi/governance/checkpoint-continuity.test.mjs`.

**Release: HOLD.** Do not deploy, merge, self-grant publication rights or publish private fragments.

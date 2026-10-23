# NYXI Agent 1 provenance observation chain

Metadata-only, fail-closed archive observations for Agent 2 original-byte verification and Agent 4 rights triage. `catalog_observed` is **not** an original-byte attestation. `original_bytes_verified` requires original private Storage bytes and validates SHA-256, byte length, exact source/acquisition identity, historical capture authorization and content-addressed private path. `rights_review_hold` records an unresolved reason. Events never contain source text, original bytes or private Storage paths and always set `publication_authorized=false`.

The SHA-256 chain is tamper-evident **only when the root is independently pinned in a separate trust domain**. It is not production immutable storage, an independent rights signature, a publication grant or an ACL. Do not infer licensing from a matching archive hash. Future production use needs a separately controlled append-only/WORM sink, writer identity, retention policy, and independent root anchoring.

No Supabase writes or production original-byte attestations are part of this PR. 310 source registrations and 214 snapshots were read-only audited on 23 October 2026, with 0 publication approvals. The three FDA approvals with missing retention deadlines affect 99 snapshots. All 50 acquisition approvals lack recognized independently archived rights-document hashes. Keep PR draft and private evidence private until the independent reviewer gate is satisfied.

Run: `node --test scripts/nyxi/governance/attestation-ledger.test.mjs`.

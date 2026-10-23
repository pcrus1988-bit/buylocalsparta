# NYXI Agent 1 provenance observation chain

Metadata-only, fail-closed archive observations for Agent 2 original-byte verification and Agent 4 rights triage. `catalog_observed` is **not** an original-byte attestation. `original_bytes_verified` requires original private Storage bytes and validates SHA-256, byte length, exact source/acquisition identity, historical capture authorization and content-addressed private path. `rights_review_hold` records an unresolved reason. Events never contain source text, original bytes or private Storage paths and always set `publication_authorized=false`.

The SHA-256 chain is tamper-evident **only when the root is independently pinned in a separate trust domain**. It is not production immutable storage, an independent rights signature, a publication grant or an ACL. Do not infer licensing from a matching archive hash. Future production use needs a separately controlled append-only/WORM sink, writer identity, retention policy, and independent root anchoring.

No Supabase writes or production original-byte attestations are part of this PR. 310 source registrations and 214 snapshots were read-only audited on 23 October 2026, with 0 publication approvals. The three FDA approvals with missing retention deadlines affect 99 snapshots. All 50 acquisition approvals lack recognized independently archived rights-document hashes. Keep PR draft and private evidence private until the independent reviewer gate is satisfied.

Run: `node --test scripts/nyxi/governance/attestation-ledger.test.mjs`.


## 23 October 2026 — externally pinned checkpoint continuity

`checkpoint-continuity.mjs` verifies a **new, independently signed** Ed25519 witness checkpoint against a **previously and independently pinned** witness anchor. It rejects replay of the old checkpoint, a truncated/reordered chain, altered historical prefix, wrong witness/key fingerprint, malformed anchor fields and nonmonotonic witness timestamps. The previous anchor must originate from a separate authenticated trust domain; do **not** accept it from the checkpoint, the database, the branch or a source page. `checkpointAnchor(chain, checkpoint, pinnedPublicKey, expectedWitnessId)` verifies the exact chain and Ed25519 signature before returning a metadata-only anchor candidate; it does not independently pin or protect that anchor. External key custody, monotonic witness counters, storage retention and actual WORM storage are still not implemented.

This continuation check never sets publication permission and never authorizes rights. It is **not** protection against a compromised witness signing conflicting successors, a stolen external anchor store, or a legitimate independent reviewer decision. It also cannot independently read original Supabase Storage bytes.

Fresh read-only database checkpoint (23 Oct ~13:18 Athens): 310 registered sources, **218** private snapshots, **2,707** private fragments, **212** extraction runs, 50 acquisition approvals, 0 publication approvals, 0 active reviewers and 0 public search documents. Three new UK OPSS source snapshots were acquired by the existing authorized collector since the 215-snapshot checkpoint. Six snapshots still lack extraction runs. Three FDA approvals without retention deadlines affect 100 snapshots. All 50 acquisition approvals lack a recognized rights-document SHA-256 in acquisition metadata. All 218 snapshot records have matching acquisition identity, authorized capture window, exact approved final URL, private Storage catalog entry and content-addressed path; zero duplicate recorded snapshot hash groups. These are **metadata-only** checks; no independent original-byte attestation was completed.

Run all suites: `node --test scripts/nyxi/governance/attestation-ledger.test.mjs scripts/nyxi/governance/witness-checkpoint.test.mjs scripts/nyxi/governance/checkpoint-continuity.test.mjs`.

**Release: HOLD.** Do not deploy, merge, self-grant publication rights or publish private fragments.


## 23 October 2026 ~15:21 Athens — authorized private Storage-byte bridge

`private-storage-attestation.mjs` provides `appendPrivateStorageAttestation` for Agent 2. The caller must be a **privileged server-side process** supplying an already-authorized Supabase Storage client and source/approval/snapshot metadata **loaded independently from the authoritative database**, never from public requests. The bridge checks exact historical authorization, source/approval/snapshot binding, private content-addressed path, maximum byte length and existing chain integrity *before* downloading. It downloads the original private Blob, independently hashes the actual bytes with SHA-256, compares the recorded byte length, then appends a **metadata-only** `original_bytes_verified` event. It fails closed for unavailable/mutated bytes and never returns private content, private Storage paths, or publication permission. It does not deploy or execute itself; no production originals were read by this PR.

Security boundary: raw `append()` is a general event serializer and **must not** be exposed as an attestation-authoring API. A forged `original_bytes_verified` event can otherwise be constructed from untrusted JSON. Production callers must use the trusted byte-verification bridge and a separately controlled witness/append-only sink; a signed chain alone is not proof that a byte-verification process actually ran. Do not use browser/public credentials, grant rights, mirror files, or put private bytes in GitHub.

Fresh read-only audit 23 Oct 2026 15:22 Athens: 310 source registrations (310 unique keys/URLs), **220** snapshots (+2 from prior 218), **2,719** private fragments (+12), **214** extraction runs (+2), 44 archived sources, 50 acquisition approvals, 0 publication approvals, 0 active reviewers and 0 search documents. All 220 recorded snapshots matched acquisition IDs, source, approved final URL, historical authorization window and private Storage catalog path. Zero duplicate recorded snapshot SHA groups, orphan/mismatched fragments or malformed fragment hashes. Six snapshots still lack extraction runs. Three FDA approvals lack retention deadlines, affecting 100 snapshots; 50 approvals have no recognized archived rights-policy hash in acquisition metadata. This audit **does not verify original private Storage bytes**.

New snapshots (metadata only):
- European Commission CosIng: `2bc6b4bf-c947-45a7-82e6-0d6d27623e37`, SHA-256 `2b1ad953f666fe3f172ac6fcae0891cb7931238b799878232882e25297107bf8`, 96,442 bytes, 4 private fragments.
- European Commission TPO nail Q&A: `dc87722d-fff2-4b4b-bf20-b148eb553e5f`, SHA-256 `33f55d859499380c9186e6d3ee67c4b0fcfcbe1a537ab41b34e258e7ad3f9910`, 105,533 bytes, 8 private fragments.

Run the new regression suite: `node --test scripts/nyxi/governance/private-storage-attestation.test.mjs`.
Keep the PR draft and publication HOLD. Independent original-byte production attestations, external key custody/root anchoring, immutable storage, documentary rights and independent human publication review remain outstanding.

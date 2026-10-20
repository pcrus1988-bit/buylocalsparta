# NYXI — HTML extraction failure recovery (20 Oct 2026)

## Live incident

The private acquisition job runs every 10 minutes. Two `eu-ec-safety-gate` HTML snapshots (`70c43b90-cfd9-4758-b6fc-f85bd4df98d6` and `16c6d4c7-9c22-4aa4-9ad3-9bfc1f37cfb3`) remained in `nyxi_corpus_manifest.extraction_status='ready'`. The private extractor returned `422 empty_extraction` each cycle (confirmed in recent `net._http_response` entries). They do not belong in an automatic retry loop.

## Implementation

The `nyxi-acquisition-worker` now:
- Reads manifest metadata, skips future `html_next_attempt_after` and flagged manual-review rows.
- Sends only eligible `ready` snapshots to the existing private extractor, max four per invocation.
- Marks terminal `empty_extraction`, `unsupported_format`, `integrity_mismatch`, or `snapshot_missing` errors `manual_review_required`. This does **not** delete archived bytes or grant access.
- Records other extraction errors privately and delays retry by six hours. After five failures, moves the snapshot to manual review.
- Reconciles an already-completed extraction run to the manifest `complete` state, with `extraction_status=eq.ready` concurrency guard.
- Does not modify source approval, acquisition rights, mirrors, reviewer permissions, public indices or publication approvals.

## Agent handoff

**Agent 2 — acquisition**: Preserve ACCC/OSHA 403 access holds. The four approved AICIS pages show `upstream_network_or_tls` transport failures and 24h cooldowns; investigate host/network behavior without proxy rotation, impersonation, cookie bypass or broad alternate-domain crawling. Submit separately reviewed exact-URL approvals if any official alternate source is selected. EUR-Lex 202 responses also require proper source-specific handling, not blind retries.

**Agent 4 — evidence/review**: Inspect the Safety Gate HTML from immutable private snapshots. A short empty shell or JavaScript-rendered page must not be labeled as an extracted regulatory claim. Manually determine a lawful, separately authorized, reproducible data source before reprocessing. Queue 1,331 pending current fragments for human review; do not issue auto approvals.

**Agent 3 — identity graph**: Keep draft canonical identity validation isolated until independent negative-path tests and provenance audit pass.

**Agent 5 — release**: Maintain reviewed-only public search and no public shades/claims without evidence, rights and human publication approvals. There were zero active reviewer accounts at audit time; reviewer enrollment needs a verified, individually authorized human.

## Verify after deploy

1. `npm test` in `nyxi-app`; run normal standalone acceptance CI.
2. Read back deployed Edge function SHA/version and confirm scheduler secret validation unchanged.
3. Execute one normal scheduled acquisition cycle (not bulk retries) and inspect the actual `net._http_response`, **not just pg_cron success**.
4. Assert the two stalled Safety Gate rows move from `ready` to `manual_review_required`, with private diagnostics. Confirm other complete acquisitions continue and the failed rows no longer appear in repeated extractor response arrays.
5. Confirm public `nyxi_search_documents_v1` and `nyxi_reviewed_fragments_v1` do not change from this recovery.

Do not reset source rights, manually set a fragment to approved, or unlock broad acquisition as part of this fix.

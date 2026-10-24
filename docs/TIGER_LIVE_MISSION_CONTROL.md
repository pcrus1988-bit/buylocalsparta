# TIGER LIVE · Mission Control integration (read-only)

Location: `/admin/tiger/live` in `apps/web`, owned by **pcrus1988-bit/buylocalsparta**, not the isolated TIGER repository.

This feature is a GitHub evidence consumer, **not** a second orchestrator. Its upstream contracts are maintained in [TIGER-2-0](https://github.com/pcrus1988-bit/Tiger-2-0), AUTOPILOT foundation branch `agent/tiger-autopilot-foundation-20261024`. Existing logical agent registry A00–A10 is not eleven permanent worker processes.

## Read-only setup

- Set server-only `TIGER_GITHUB_READ_TOKEN` with scoped **Contents: read**, **Actions: read**, **Pull requests: read** access to private repository `pcrus1988-bit/Tiger-2-0`. Do not put this in a `NEXT_PUBLIC_*` variable or client payload. Use a dedicated minimal read token and rotate it routinely.
- The server reads authoritative branch `autopilot-runtime-state`, files `runtime/state.json` and `runtime/events.ndjson`. Do not synthesize worker state from PR titles.
- The AUTOPILOT foundation is unmerged and the durable runtime snapshot at initial implementation is revision 0 with an empty NDJSON log. Verify that upstream emits real events **before** claiming end-to-end completion.
- `admin.audit.read` authorization is required on page, snapshot, and SSE. No browser mutation, worker credential, terminal, or execution command is exposed.
- The external PR/issue/workflow URLs are constrained to the approved private TIGER GitHub repository. The server truncates the displayed history to 120 entries and caps log reads at 900 KB. A real archived event store and cursor pagination are follow-on integration gates.
- GitHub API failures return `DISCONNECTED`. Missing token returns `NOT CONFIGURED`. Reachable idle state returns `NO ACTIVITY`; stale lease returns `STALE`; logical worker activity requires fresh lease and attributable role prefix. No fabricated animations.

## Current implementation limitations (release blockers)

- GitHub read is a 15-second in-instance cache; authenticated SSE makes a bounded read every 20 seconds per stream, so this is not multi-instance global fanout and is not a production-scale subscription broker.
- GitHub history and AUTOPILOT state come from separate requests and are not transactionally consistent. UI re-evaluates authoritative state on each snapshot. For strict event replay and monotonic transport cursors, connect an authenticated durable event ingestion service with its own sequence and snapshot reconciliation without duplicating AUTOPILOT task state.
- The AUTOPILOT hash-linked NDJSON is persistent in GitHub but has not yet been verified as receiving worker activity. GitHub Actions CI evidence is real; achievement verification is intentionally unimplemented, keeping the wall empty.
- EventStream transport reconnects automatically; it currently sends snapshots on changes and pings while unchanged. The client always replaces whole snapshots, so CI/PR events can be reordered as evidence arrives. Introduce stable event cursor/page history and deduplication on the durable integration layer prior to production.
- A00–A10 speech bubbles require future explicit redacted `agent.message`/`agent.handoff` events; nothing is synthesized.
- Manual PR review, unit/production CI, mobile inspection, reduced-motion/keyboard tests, a real end-to-end worker event, and independent security review are mandatory before release.

## Proposed measurable performance budgets

- Initial usable shell under **3 s** on desktop broadband and **5 s** on mid-range Android in an authenticated test environment (not yet measured).
- CSS office no WebGL dependency; at most **1** active browser EventSource; server polling no faster than **20 s**, upstream cache **15 s**; DOM activity list capped at **120 events**.
- Client idle office must have **no autonomous animation**. Reduced-motion preference disables all motion. CPU/frame and battery impact on Android remain to be profiled.

## Verification

1. Run Next.js typecheck/build and the full GitHub CI at the **exact PR commit**.
2. Confirm anonymous and unauthorized users cannot obtain page, snapshot or stream.
3. Connect read-only repository token **in a non-production environment only** after security review.
4. Trigger a real AUTOPILOT transition in an isolated runner; validate provenance, event and state cursor, worker heartbeat and UI update.
5. Test disconnection, reconnection, browser sleep, stale lease, role mismatch, Android 2D fallback and reduced motion. No visual-demo content may masquerade as reality.
6. Obtain explicit owner approval before production merge/deployment. Production deployment is **not approved**.


## No-API ChatGPT Task allocation bridge

The existing TIGER no-API claim protocol is maintained upstream in TIGER PR #82; no new coordinator is introduced in the admin application. The dashboard **reads only** `autopilot-runtime-state:runtime/claims/*.json` using the same server-side GitHub read token, validates exact claim fields, task naming, A02 role declaration, expiry duration (maximum 120 minutes), repository, and bounded file size. A missing claims directory on the initialized branch means **zero allocations**, not a broken GitHub connection.

Recorded claims appear under **Allocated** and in the evidence feed and, once expired, under the issue wall with explicit reconciliation required. A claim is an allocation declaration, not an authenticated continuously hosted process or a heartbeat. Claims must never move a tiger desk to `working`, increment the `Running` count, or falsely advance the authoritative revision-zero state ledger. Only a real AUTOPILOT state-machine lease with a fresh heartbeat can show a live worker.

After the separate no-API claim-writer PR is reviewed and merged, the scheduled ChatGPT engineering Task may create claim documents atomically with the connected GitHub `create_file` operation. GitHub Actions remain read-only; claims must originate from actual Task execution. The dashboard does not change or delete claims, resolve collisions, fabricate review events or auto-merge. Expired allocations require inspection of real PR/commit evidence before manual reconciliation.

The read-only API keeps its existing `admin.audit.read` permission and `no-store` response headers. Never move the private GitHub token to a browser bundle or `NEXT_PUBLIC_` variable.
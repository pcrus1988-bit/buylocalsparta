# NYXI private triage — operational contract (20 October 2026)

## Goal
Unblock human review while preserving the existing dual-actor publication contract.
A triage event is an **append-only private note**, not a fragment approval, rights
authorization, regulatory classification, product-safety claim or public search item.

## Data contract
- Table `nyxi_fragment_triage_events_v1` requires actor, immutable current valid
  fragment and snapshot SHA-256, classification, 20–1000-character reason and request UUID.
- PostgreSQL `nyxi_record_fragment_triage_v1` checks `nyxi_private_review_queue_v1`,
  active `nyxi_reviewers` membership and source/snapshot provenance inside the write.
- Unique `(reviewer_user_id,request_id)` prevents duplicate network-request submission;
  mismatched retries reject rather than overwriting a previous decision.
- UPDATE/DELETE are disallowed by trigger. `anon`/`authenticated` roles have no table
  or function rights. Only `service_role` can execute the transaction.
- All decisions, including `candidate_for_review`, remain **unpublished**.
  Public `nyxi_reviewed_fragments_v1` stays unchanged.

## Auth contract
- `nyxi-reviewer-triage` requires valid Supabase Auth JWT, confirmed email, current
  reviewer or publisher role from the separate allowlist; it rechecks membership on
  every POST. This function is deployed with `verify_jwt=true`.
- Next.js `/api/reviewer/triage` is a same-origin, no-cache bearer-token proxy.
  No service-role credential ever enters Next.js or browser.
- UI is available only within the existing private reviewer login session.
- Browser tokens remain in React memory, not local/session storage.

## Human owner actions — never automated
1. Independently invite verified reviewer(s) in the Supabase Auth dashboard.
2. Independently add the exact verified user UUID to `nyxi_reviewers`.
3. Test revoked/rejected identity, expired session and unauthorized account paths.
4. Determine authority and rights basis before separately configuring a publisher.
5. Perform provenance, intellectual property, jurisdiction, supersession and
   evidence-validity checks. This is deliberately not a public approval route.

## Release acceptance
1. NYXI Standalone Acceptance tests + Next.js TypeScript/build pass.
2. Apply the production SQL migration and verify anon/authenticated privileges absent.
3. Verify RPC has zero triage rows before any human use and that it does not change
   existing publication approvals, reviewed fragments or search documents.
4. Deploy/read back `nyxi-reviewer-triage`, `verify_jwt=true`.
5. Confirm missing JWT HTTP 401; absence of approved reviewers means no new decisions
   are possible. Do NOT invent an account or seed a reviewer.
6. Confirm public search stays empty when no dual-approved evidence exists.

## Roles for the next agent cycle
- Agent 4: human reviewer onboarding tests, triage QA and independent decisions;
  keep `candidate_for_review` separate from final approval.
- Agent 1: assess exact excerpt rights independently; do not convert source acquisition
  rights into public excerpt rights.
- Agent 3: respect private identity candidate status; avoid automatic manufacturer
  verification from community-contributed product records.
- Agent 5: present candidate source citations privately, keep public search fail-closed.

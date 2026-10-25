# MAZI invitation-only onboarding — production activation gates

**Candidate:** PR #1760, SQL migrations 016–017. Draft marketplace and MAZI website code is not production-active merely because it is committed.
The existing founding needs-assessment round stays zero-funded. Membership invoicing, fund custody, marketing credits, award payout and automatic voting eligibility remain disabled.

## Development status — 24 October 2026
- **MAZI Edge gateway v9 ACTIVE:** lightweight authenticated `admission_status` now available, with the same JWT validation and legacy open-apply rejection.
- **Private schema:** migrations 016 (invitations), 017 (45-minute cap), and 018 (append-only Super Admin launch-gate review) applied to shared Supabase project `eemihhfreggbigxejjhj`. Migration 018 has RLS enabled, no direct anon/authenticated/service_role table grants, an immutability trigger and zero review records.
- **Source-only admin:** implemented live `/admin/mazi/operations` read-only aggregate dashboard plus optional, authorized human sign-off/reopening of email, legal, and consenting-business tests. The latest protected marketplace preview built READY at `https://buylocalsparta-p7bvvvqgj-sp-business-lab.vercel.app/admin/mazi/operations`.
- **MAZI-specific CI:** passed; full Production CI of the newest candidate must be checked independently before merge.
- **No business or funding activation:** zero live MAZI interest applications, invitations, verified members, fund ledger entries and award offers. All these processes remain genuinely inactive until launch gates are cleared and the PR is deliberately merged.
- Detailed operational implementation: `mazi-app/docs/OPERATIONS_CONTROL_ROOM.md`.

## Live activation record — 23 October 2026
- **LIVE:** SQL 016 invitation/acceptance model and 017 hard 45-minute invitation-expiry cap applied to shared Supabase project `eemihhfreggbigxejjhj`; confirmed RLS blocks direct anon/authenticated access.
- **LIVE:** `mazi-member-api` Edge gateway v8; JWT validated using Supabase Auth `getUser` before nonpublic operations, open `apply` returns 403.
- **PREVIEW:** Latest verified protected MAZI preview `https://mazi-marvhubju-sp-business-lab.vercel.app` built at commit `5b3a36ad`; matching dedicated MAZI CI and monorepo Production CI passed.
- **SOURCE ONLY:** Subsequent `admission_status` lightweight auth-only check added so invitation onboarding no longer depends on member-dashboard queries. Requires CI/preview verification and Edge v9 deployment before website launch.
- **STILL PENDING:** The marketplace production admin UI and new MAZI frontend are not merged. Actual Supabase Auth OTP lifetime, invite and magic-link templates, SMTP, allowed redirect URLs and real consenting-business E2E need verification.
- **GUARD:** No fictitious businesses or test users; funding cycle remains zero-budget, nonfinancial and no automatic voter entitlement.

## Safety of the authorized production deployment — 25 October 2026
- The user explicitly authorized deploying completed MAZI work to production. Deployment **does not** implicitly authorize sending an unverified business email, activating paid membership or financing.
- Before the Super Admin can issue *any* actual invitation, the server now checks the latest immutable `auth_email_delivery` and `legal_and_retention` reviews are both `verified`, and checks the founding cycle, all funded cycles, ledger and grant offers still satisfy the zero-funding lock.
- A later `reopened` review closes the email issuance gate again; there is no automatic approval of invitation mailing after production deployment.
- The `consenting_business_e2e` review follows the first real invitation and is independently blocked unless live records prove an approved, accepted, verified ΓΕΜΗ business; it is **not** required before sending that first consent-based invitation.
- Production website domain and marketplace admin rollout must be independently verified after any merge/deployment. A successful CI or Vercel READY status alone is not proof of full real-world E2E delivery.

## Chain of trust
1. A business sends the real AFM/GEMI interest request. Nothing is registered in Supabase Auth; no billing or membership profile is created.
2. The marketplace Super Admin independently verifies representation, contact-email control and active GEMI status, then approves `approved_pending_invite`.
3. On a separate explicit Super Admin command, marketplace server (not the browser) creates an invitation record and calls the **same MAZI Supabase project's** Auth admin `/invite` for new Auth accounts. If and only if the provider explicitly reports an existing registered email, the server uses the Auth `/otp` existing-account email flow with `create_user:false` and the same fixed redirect. No user-metadata claims grant permissions, and no fallback on SMTP or rate-limit errors.
4. Supabase sends its own expiring one-use email invitation to the previously verified address. Confirmed email is checked again by PostgreSQL before membership creation.
5. An authenticated recipient sees the entire v1 invitation terms, checks two initially unchecked boxes, and submits acceptance through the JWT-verifying MAZI Edge gateway.
6. Service-only `mazi_complete_invitation` checks status, identity, expiry, confirmed email, duplicate legal entities, terms and one-time consumption inside one locked transaction. It creates an approved **nonfinancial** membership profile and immutable acceptance record, **voting_eligible=false**.
7. Future paid membership (proposed €250/month) and non-repayable growth support require separately signed, reviewed and activated agreements. Grant retention policy v1 is not activated here.

## Production prerequisites (do not skip)
- Run CI `MAZI Invite-only Admission Acceptance` to completion, including npm tests, Next typecheck and build. Run the marketplace build on the same commit.
- Legal review of terms, GDPR notices, controller role, retention and funding structure before any external onboarding campaign.
- Both migrations 016 and 017 are already applied: in Supabase `eemihhfreggbigxejjhj`, verify their migration history and schema, without reapplying them. Verify the two tables, RLS, no direct anon/authenticated grants, and RPC EXECUTE restricted to service_role. Do not alter existing membership or grants.
- The matched `mazi-member-api` v9 is deployed and read-back verified. Verify its `admission_status`/invitation operations and JWT check before release. It must continue to reject unauthenticated calls and open `apply`. Verify its new `invitation_state` and `accept_invitation` operations and that legacy `apply` returns 403.
- Verify marketplace server's `SUPABASE_URL` resolves to exactly `https://eemihhfreggbigxejjhj.supabase.co` and its server-only `SUPABASE_SERVICE_ROLE_KEY` belongs to that project. Optional dedicated `MAZI_SUPABASE_URL`/`MAZI_SUPABASE_SERVICE_ROLE_KEY` may override. Never expose admin keys via `NEXT_PUBLIC_`.
- Confirm the actual Auth Email OTP Expiration is **at least 45 minutes** (default is one hour) and the MAZI invitation's server-issued 45-minute database cap is respected. Never claim longer validity than Auth.
- Confirm BOTH Auth templates (new-user Invite and existing-account Magic Link / OTP) produce a usable link to MAZI, and are configured for custom SMTP. Numeric-only OTP templates require a separate code-entry UI and must not be used for the current flow.
- Confirm Supabase Auth email templates and SMTP sending are authorized for non-team businesses, and exact `https://mazi.kontamou.site/auth/callback` redirect is allowlisted. A successful provider API response means accepted for sending, not proven inbox delivery.
- Validate marketplace `/api/mazi-interest` against real official GEMI adapter, CORS and server-side abuse protection.
- Run one consenting business through actual AFM → Super Admin review → invite email → confirmed Auth session → member acceptance. Never insert fictional production applicants.
- Check login and access for existing real members, duplicate legal entities, expired/repeated invitations, mismatched email, declined application, missing checkbox and already consumed invitation. Check no membership payment, ledger entry, award or voting privilege appears.
- An undelivered invitation records `delivery_failed`. The Super Admin UI now requires documented manual provider reconciliation before retry. Active or expired `email_sent` invitations require a logged, explicit revocation with written reason before a new individual invitation can be issued; a revoked link cannot create MAZI membership even if Supabase Auth continues to recognize the old email link. No automatic retry, bulk mail or automatic revocation.

## Current implementation limits
- This code has no scheduled delivery retries, bulk invites, direct browser invitation registration, payments or e-signature service. Manual revocation/reissue is audited and never assumes provider delivery.
- Existing verified Supabase Auth email ownership is necessary but not enough for MAZI membership. Admin review and explicit acceptance are independently required.
- The v1 terms concern nonfinancial admission only; they do not execute the commercial €250 membership agreement or a binding grant agreement.

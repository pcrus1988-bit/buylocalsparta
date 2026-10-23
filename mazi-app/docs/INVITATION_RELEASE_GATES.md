# MAZI invitation-only onboarding — production activation gates

**Candidate:** PR #1760, SQL migration 016. The source is not production-active merely because it is committed.
The existing founding needs-assessment round stays zero-funded. Membership invoicing, fund custody, marketing credits, award payout and automatic voting eligibility remain disabled.

## Chain of trust
1. A business sends the real AFM/GEMI interest request. Nothing is registered in Supabase Auth.
2. The marketplace Super Admin independently verifies representation, contact-email control and active GEMI status, then approves `approved_pending_invite`.
3. On a separate explicit Super Admin command, marketplace server (not the browser) creates an invitation record and calls the **same MAZI Supabase project's** Auth admin `/invite`. No user-metadata claims grant permissions.
4. Supabase sends its own expiring one-use email invitation to the previously verified address. Confirmed email is checked again by PostgreSQL before membership creation.
5. An authenticated recipient sees the entire v1 invitation terms, checks two initially unchecked boxes, and submits acceptance through the JWT-verifying MAZI Edge gateway.
6. Service-only `mazi_complete_invitation` checks status, identity, expiry, confirmed email, duplicate legal entities, terms and one-time consumption inside one locked transaction. It creates an approved **nonfinancial** membership profile and immutable acceptance record, **voting_eligible=false**.
7. Future paid membership (proposed €250/month) and non-repayable growth support require separately signed, reviewed and activated agreements. Grant retention policy v1 is not activated here.

## Production prerequisites (do not skip)
- Run CI `MAZI Invite-only Admission Acceptance` to completion, including npm tests, Next typecheck and build. Run the marketplace build on the same commit.
- Legal review of terms, GDPR notices, controller role, retention and funding structure before any external onboarding campaign.
- In authorized Supabase `eemihhfreggbigxejjhj` apply migration `016_verified_single_use_invitations.sql` once. Verify the two tables, RLS, no direct anon/authenticated grants, and RPC EXECUTE restricted to service_role. Do not alter existing membership or grants.
- Deploy matching `mazi-member-api` Edge function with JWT validation *before* deploying the frontend and admin UI. Verify its new `invitation_state` and `accept_invitation` operations and that legacy `apply` returns 403.
- Verify marketplace server's `SUPABASE_URL` resolves to exactly `https://eemihhfreggbigxejjhj.supabase.co` and its server-only `SUPABASE_SERVICE_ROLE_KEY` belongs to that project. Optional dedicated `MAZI_SUPABASE_URL`/`MAZI_SUPABASE_SERVICE_ROLE_KEY` may override. Never expose admin keys via `NEXT_PUBLIC_`.
- Confirm Supabase Auth email templates and SMTP sending are authorized for non-team businesses, and exact `https://mazi.kontamou.site/auth/callback` redirect is allowlisted. A successful provider API response means accepted for sending, not proven inbox delivery.
- Validate marketplace `/api/mazi-interest` against real official GEMI adapter, CORS and server-side abuse protection.
- Run one consenting business through actual AFM → Super Admin review → invite email → confirmed Auth session → member acceptance. Never insert fictional production applicants.
- Check login and access for existing real members, duplicate legal entities, expired/repeated invitations, mismatched email, declined application, missing checkbox and already consumed invitation. Check no membership payment, ledger entry, award or voting privilege appears.
- An undelivered invitation records `delivery_failed` and requires manual reconciliation with Supabase Auth before retry; an expired `email_sent` invitation likewise needs an authorized revocation/reissue policy. Do **not** resend automatically when the provider state is ambiguous.

## Current implementation limits
- This code has no scheduled delivery retries, bulk invites, direct browser invitation registration, payments or e-signature service.
- Existing verified Supabase Auth email ownership is necessary but not enough for MAZI membership. Admin review and explicit acceptance are independently required.
- The v1 terms concern nonfinancial admission only; they do not execute the commercial €250 membership agreement or a binding grant agreement.

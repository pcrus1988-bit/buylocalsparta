# ΜΑΖΙ — operational foundation

**Production domain**: https://mazi.kontamou.site  
**Vercel root directory**: mazi-app  
**Source**: pcrus1988-bit/buylocalsparta, independent of the marketplace's web workspace

## Delivered
- Actual Supabase email-link authentication with server cookie refresh and verified user sessions (subject to Auth redirect allowlist setting).
- Persistent business membership applications, one per verified identity, with explicit processing notice.
- Restricted administrator review and verified membership admission; no automatic administrator bootstrap.
- Persistent member proposals per real non-financial founding needs-assessment cycle.
- Real eligibility-controlled one-member-one-proposal support voting, limited to actual reviewed proposals in a voting-stage cycle.
- Append-only audit events for admission and votes, row-level security on every MAZI table.
- Dedicated fund ledger schema with **zero financial operations enabled**.
- No fictional businesses, fake votes, seeded grant balances or simulations. Previous /demo now redirects to real registration.

## Supabase project
Currently uses existing `supabase-beige-apple` project (ref: `eemihhfreggbigxejjhj`) with new `public.mazi_*` tables only. No original table changes. A dedicated independent Supabase project should be considered after the first real intake cycle to isolate resource demand.

Migration: `sql/001_collective_foundation.sql`. Data API access is restricted by ownership/roles and RLS. Backend keys use public publishable key only; **never put service-role keys in browser**.

## Auth activation prerequisite
Confirm Supabase Authentication URL Configuration lists `https://mazi.kontamou.site/auth/callback` as an allowed redirect. After that, send a login email from /join and complete the callback.

## Sole administration — inherited from ΚΟΝΤΑ ΜΟΥ

ΜΑΖΙ has no independent administrator credential, role or account. Its administrative workspace is hosted exclusively at `https://kontamou.site/admin/mazi`, protected by the existing marketplace Super Admin session. The `/admin` route on `mazi.kontamou.site` redirects to that workspace. All privileged writes verify both the logged-in Super Admin and the persisted active marketplace `super_admin` role, and require the existing marketplace admin CSRF token. They append an audit event with the marketplace actor ID.

The former `mazi_administrators` lookup always returns false and is no longer an authorization source; member and employee accounts cannot elevate themselves. The existing Super Admin is the single administrative authority; member voting and project proposal permissions are separate.

SQL: `sql/003_marketplace_superadmin_only.sql`. No payment operations are active.

## Start
`npm install`, `npm test`, `npm run build`.

## Financial safety
No real financial service, pooled payments, crowdfunding or grant distributions are active; these require legal review, entity governance, segregated fund custody, tax/VAT handling and independent financial approvals before enabling. This is *not* a funding simulator; the app runs actual member and proposal intake but currently operates a zero-euro founding needs-assessment cycle.

## 2026-10-22 · real applicant follow-ups
- Super Admin may send one pending information request at a time to an actual applicant from `/admin/mazi`.
- Requests and owner-only answers live in `public.mazi_application_followups`; the dedicated `mazi-member-api` Edge gateway validates the caller's Supabase JWT before looking up the account's application.
- Reply values are insert-once: PostgreSQL prevents edits to a submitted answer or review prompt. The requester and applicant actions are written to the MAZI audit ledger (reply content itself is not duplicated into the audit).
- The Super Admin may review an application only when there are no open information requests; identity verification still requires official ΓΕΜΗ review.
- The member API is granted only SELECT and column-scoped UPDATE(answer, answered_at) on the follow-up table, not Super Admin approval rights.
- No background mail or automations are activated, no fake applicants or dummy transactions, and no funding activation.

## 2026-10-22 · Data API grant hardening (migration 012)
- All 13 existing public.mazi_* tables deny direct Data API access for the `authenticated` browser role. The `anon` role retains only SELECT on the narrowly RLS-filtered zero-budget founding-cycle row in `mazi_cycles`.
- Real applications, proposals, ballot reads/writes and applicant answers continue **only** through the JWT-verifying `mazi-member-api` gateway. The marketplace Super Admin retains its separate direct PostgreSQL server connection; no member-facing admin identity is introduced.
- Existing scoped `service_role` privileges, including the follow-up answer column grants, remain intact. The Edge service still has **no access** to the financial ledger.
- Supabase migration `012_lock_down_client_role_grants.sql` applied and checked against live Postgres on 2026-10-22; neither member records nor financial balances were altered.
- `npm test` includes a static grant contract. This is not an end-to-end verification of email OTP or Super Admin sessions. Exercise those with a real consenting applicant before declaring onboarding fully validated.

## 2026-10-23 · Magic-link callback compatibility
- The fixed `/auth/callback` route completes PKCE code exchange and supported token-hash links on the server. Requests that carry neither type redirect **only to the MAZI same-origin** `/auth/finish` page, preserving the browser URL fragment when present (RFC 9110 §10.2.2).
- `/auth/finish` immediately clears fragment credentials from the address bar before instantiating the Supabase browser client. It verifies the session with `setSession` and uses `@supabase/ssr` cookie storage; the next `/members` request independently checks the user server-side.
- Invalid, expired and malformed credential fragments return to `/join`; completed server-side callback redirects include an explicit empty fragment so tokens cannot be inherited by ordinary pages.
- No Supabase project-wide authentication template or redirect allowlist settings have been changed. Verify the real Supabase email template and the production redirect allowlist, then complete a real opt-in business login before marking end-to-end email sign-in verified.
- Unit tests cover the fallback fragment parsing, invalid links, same-origin redirects and redaction order. These tests do not send emails or create fictional member records.

## 2026-10-23 · invite-only product direction
- The approved direction is **open business interest by AFM and authorized GEMI lookup**, followed by **marketplace Super Admin approval and individual invitation**. The current public-OTP application flow is still live; its replacement is not yet operational and must be released atomically after real acceptance testing.
- Specification: [docs/INVITE_ONLY_PRODUCT_CONTRACT.md](docs/INVITE_ONLY_PRODUCT_CONTRACT.md).
- Added pure AFM checksum and fail-closed invitation eligibility checks with tests, without touching existing users, invitations, subscription plans, ledger balances or finance.
- Commercial proposal: KONTA MOY supplies HUB PRO plus 250 EUR equivalent of marketing services. Existing vendor plan mapping and token/fiscal rules must be verified before issuing benefits.
- Growth Fund intent is support without ordinary repayment. Do not label it a binding loan absent legal review; fund balance remains zero and finance disabled.

## 2026-10-23 · Proposed grant retention and first-time request priority
- See [GRANT_RETENTION_POLICY_V1.md](docs/GRANT_RETENTION_POLICY_V1.md). Conditional non-repayable development support may entail an *additional* membership period only after a legally valid separate acceptance and actual disbursement; this is not a loan.
- Formula: additional months = ceiling(requested grant cents / 10,000 cents). Reapplication after 80% of additional months, rounded up. Existing commitments stack and cannot overlap; ordinary members can cancel with ten calendar days' notice before month end.
- First-ever financial support requests should be flagged and queued before repeat applicants, **excluding** the nonfinancial founding needs assessment from prior-grant application counts; precedence does not replace democratic voting.
- New migration 013 and matched Edge/UI changes require prospective **disclosure-only** consent at every member Need submission. Binding award acceptance and disbursement are separate **unimplemented** workflows. Never enable financial operations without legal/tax review.

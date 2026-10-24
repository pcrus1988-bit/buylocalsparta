# MAZI — Super Admin operational control and accountable release reviews

Location after the marketplace PR is deployed:
- `/admin/mazi/operations` (reads private live data; only the existing KONTA MOY Super Admin)
- Linked from `/admin/mazi` and `/admin/mazi/interest`

## Live operational facts (never mocks)

- Anonymous and member visitors cannot load the operational report. It verifies both the logged-in marketplace Super Admin role and its still-active persisted database role.
- The report reads **aggregate counts only**, no AFM, email, representative names, Auth tokens or private review notes.
- It reports: interest queue, approved prospects whose ΓΕΜΗ checks are over 7 days old; invitation lifecycle, pending delivery older than 10 minutes, provider delivery failure and expired unused links; consumed/acceptance integrity; accepted members and verified identities, voting rights, proposals/ballots; audit-event totals.
- Financial safety explicitly checks the real founding needs-assessment cycle, all nonzero/finance-enabled cycles, fund ledger entries and grant-award offers. If any financial data appears unexpectedly, the page displays an alert, not a fictional €0 guarantee.
- It fails closed if database access or role verification fails, never displaying cached or invented values.

## Manual, immutable release reviews (migration 018)

The append-only private table `public.mazi_launch_gate_reviews` records:
- `auth_email_delivery`: actual project-specific Auth OTP expiry, email templates, SMTP and callback URL.
- `legal_and_retention`: genuine counsel/legal approval, versioned privacy/terms and published data-retention policy.
- `consenting_business_e2e`: a real business's consent-based AFM → ΓΕΜΗ → representative and email verification → individual invite → explicit nonfinancial acceptance.

Each record has the gate name, `verified` or `reopened`, human-written evidence of 40–1200 characters, the persisted actor user ID, and database-recorded timestamp. UPDATE/DELETE is rejected. Only the existing marketplace Super Admin can create records via a CSRF-checked server action; no grant is made to anon, authenticated or service_role roles. Do not include AFM, email addresses, participant PII, tokens, credentials or signed legal documents in the free-text evidence—reference secure internal evidence locations instead.

**These manual reviews are a record of human claims, not an independent test of SMTP, legal compliance, payment readiness or production deployment authorization.** Updating them never merges code, changes Vercel settings, enables billing or gives members voting rights. Each review can be superseded by a later append-only `reopened` entry.

## Release sequence and validation

1. Apply migration `018_superadmin_release_gate_reviews.sql` **only after reviewing and testing the schema**, to the same shared MAZI Supabase database. Do not apply it to a different FISCAL or development project.
2. Verify the private table, RLS, no browser grants, append-only trigger and no membership/fund changes.
3. Pass MAZI invitation/operations CI and full repository Production CI. Verify the marketplace preview build against `/admin/mazi/operations`.
4. Deploy the marketplace frontend only through an approved PR merge/release. Until deployment, this is **source-only**, even if the private table already exists.
5. Confirm each human gate with appropriate real evidence. Do **not** auto-activate any financial or public-invitation feature even after all three are verified.

Source: `apps/web/src/lib/mazi-operations.ts`, `apps/web/src/app/admin/mazi/operations/`, `mazi-app/sql/018_superadmin_release_gate_reviews.sql`, `mazi-app/tests/operations-control-contract.test.mjs`.

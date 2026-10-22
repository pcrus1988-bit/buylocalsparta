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

# MAZI — Service Operations & Token Reconciliation

Implementation: `/admin/services/operations` backed by `mazi_services_internal_admin_health(uuid)` and the authenticated `mazi-service-api` operation `admin_health`.

## Authorization

- The request must carry a valid Supabase Auth JWT.
- The Edge gateway checks the caller against `public.mazi_administrators` before invoking the RPC with `p_actor=user.id`.
- The database function repeats that administrator check. The RPC is `SECURITY INVOKER`, executable only by `service_role`; `anon` and `authenticated` retain no public schema USAGE or direct execution rights.
- The admin report contains confidential member IDs and verified invoice references. Never expose its response through a public endpoint, CDN cache or browser-accessible service-role key.
- At the time of development, the MAZI database had **0** administrator rows and **0** admitted members. That is an **access-provisioning blocker** for authenticated MAZI admin features, not a reason to appoint an arbitrary user. The existing main-site `/admin/mazi` route uses a separate administrative context; its identity must be mapped via an explicitly verified, auditable integration. A solitary Supabase Auth user and an email-confirmed status are *not* sufficient proof of super-admin rights.
- Provision and validate access only after verifying the account identity against the existing KONTA ΜΟΥ super-admin ownership record and recording who authorized the mapping. Do not change billing state during access provisioning.

## Token-unit accounting model

For each paid 250-Token period:

- `committed`: sum of request prices in `requested`, `accepted`, `in_progress` or `completed`.
- `reserved`: `requested`, `accepted`, `in_progress` only.
- `completed`: `completed` only. The same Tokens cannot be counted again as a new monthly allocation.
- `unallocated`: `max(allowance - committed, 0)`.
- `available_active`: `unallocated` for periods whose start has passed and end has not passed.
- `expired_unused`: `unallocated` for periods that have ended. It is NOT transferable credit and may reflect subsequent cancellations in that ended period.
- `future_allocated`: allowance for future periods, not currently spendable.
- `ledger_difference_tokens`: negative of the sum of immutable service-event deltas minus committed Tokens. Zero is the expected all-period conservation value.
- `overdrawn_periods`: any period with committed Tokens above its issued allowance.
- Counts are recomputed from **all** stored periods, requests and events; the individual detail cards deliberately show only the 30 latest cycles. Do not sum those detail cards to generate the official totals.

These are **service entitlement units** (catalogue Tokens), not cash, revenue, paid advertising spend, profit, tax or an audited bank reconciliation.

## Fulfilment warnings

- Waiting longer than 48 hours: a `requested` service older than 48 elapsed hours, not a legal guarantee.
- Open longer than 14 days: `accepted` or `in_progress` older than 14 elapsed days measured from initial creation, not a computed Greek-business-day contractual SLA.
- Missing order receipt: a request without a versioned, immutable acknowledgement.
- Completed without delivery: completed status with no recorded delivery message.
- Revision in progress: a reopened request with a revision-request history.

Warnings are operational review signals, not automatic refusals, sanctions or contractual findings.

## Financial launch lock

`public.mazi_service_release_state.paid_enabled` remains **false** until legal, accounting/VAT and actual payment integration verification have been established separately. Neither the report nor this runbook is evidence that those tasks have been completed. The report is read-only and offers no activation toggle.

The earlier manual invoice reference field **does not itself verify real bank/PSP settlement**. Release readiness therefore still requires provider-level reconciled settlement records, invoice linkage, refund/chargeback handling, documented GDPR retention, and legal review of how monthly on-demand service credits are supplied. No live paid cycles may be created until all controls are approved.

## Validation checklist

1. CI: token contract tests + operations contract tests + Next.js typecheck and production build.
2. Production SQL, dry run: read-only report function against a transaction-local administrator fixture, **ROLLBACK** before leaving the transaction; verify zero persistent new rows.
3. Production privileges: `anon` and `authenticated` cannot execute the report RPC; only the Edge service role can.
4. Production authorization: without a verified admin mapping, authenticated access must fail closed.
5. Production totals: compare live report to raw database rollups. Show honest zeros rather than demo data.
6. Site: check new production commit, public catalogue, and login protection of both admin paths.
7. When an actually verified MAZI admin exists, do an authenticated end-to-end read, and later test paid service requests only in a separate controlled acceptance environment. Until then **do not claim that authenticated admin access or real payment lifecycle has been tested**.

## Recovery

If the report function fails, the UI shows an unavailable state and does not fabricate historical totals. The service catalogue and order request workflow remain independent. Revert only the reporting PR if required; leave existing paid-activation locks and token transaction logic untouched.

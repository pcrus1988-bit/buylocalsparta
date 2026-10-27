# MAZI — Αναπτυξιακό Ταμείο / Business Growth Fund — Control Standard v1
Status: **implemented zero-money foundation; payout and subscriptions DISABLED pending professional legal/tax signoff**.

## Purpose and membership
MAZI is an invite-only programme for verified independent Greek businesses. The general commercial programme envisages a €250/month fee for KONTA MOY HUB PRO and marketing support; none is currently collected by the Fund. A *contractually agreed and actually accounted* portion may finance the Business Growth Fund, but the €100 retention calculation basis **does not itself establish a percentage of subscription revenue allocated to a bank fund**.

Only verified legal business identities (ΓΕΜΗ) may submit one funded application and cast one irrevocable ballot per round, even if multiple user accounts represent the same enterprise. Member fee size never increases voting power.

## Governance cycle
1. **Published rules and pre-commitment:** Super Admin publishes funding window, eligible legal entities, budget backed by segregated cash and current reconciliation, cap per project, minimum useful amount, quorum, vote method, conflict definition, appeal window and deterministic allocation-policy version. Once voting begins, rules and electorate snapshot must be frozen in an append-only audit record.
2. **Proposal:** verified business provides title, category, evidence, requested euros (including costs), minimum amount needed for a useful outcome, milestones, and mandatory advance information about possible additional membership obligations. One submission per ΓΕΜΗ per cycle.
3. **Administrative eligibility:** Super Admin verifies registry standing and representative, cost rationale, intended business development use, duplications, connected parties, eligibility, privacy redactions, and objectively documented acceptance/rejection. An approved proposal is NOT a grant.
4. **Voting:** one authenticated and immutable ballot per ΓΕΜΗ supporting 1–20 eligible projects; no voting for own business or formally related interests, with unique constraint on cycle+ΓΕΜΗ and advisory close-stage serialization. Raw voter identity/choices are not public; released totals must remain verifiable through private audit.
5. **Result finalization:** voting ends and all ballot conflicts/revocations resolve before frozen support totals. A super-admin decision with transaction locks, formal result receipt, and an appeal window is required; counting alone never creates an award.
6. **Allocation proposal:** standalone `lib/fund-allocation-policy.ts` produces a deterministic **nonbinding preview** using only a finalized approved tally, quorum, first-time priority, useful minimum, caps and budget. Phase 1 covers useful minimums across as many supported projects as possible; phase 2 distributes residual cash proportional to votes, in integer cents, with deterministic ties. If quorum is unmet, all funding stays unallocated. Priority is for businesses without a previous *funding request* (not just businesses without an award).
7. **Award:** legal/tax review, approved provider and bank controls, separate accepted full agreement with SHA-256 of frozen text. Recipient accepts requested-amount formula and months with explicit documented consent; no automatic payouts or contract formation. Award offers are immutable and budget-checked.
8. **Disbursement (NOT IMPLEMENTED):** actual segregated account, confirmed incoming funds, verified approved invoice, KYB/IBAN reconciliation, independent authorization, payout callback integrity, bank statement matching, safe reversal/refund path and fiscal treatment. Never pay on the strength of votes or award acknowledgement alone.
9. **Project performance:** publish approved non-personal description, funded amount, amounts disbursed versus assigned, milestone completion, funds used with redacted evidence digests, variance from approved budget, and independent review outcome. Require recipient documentation and escalation on missing reports, irregular expenses or diversion.
10. **Closure:** close only after matching ledger, account statements, award obligations, project outcomes, review of dispute cases, and release of retained unallocated funds per published rules.

## Recipient extra-month commitment
Monthly fee €250 × 40% = **€100 calculation base**.
```
additional_membership_months = ceil(original_requested_grant_euros / 100)
reapplication_wait_months    = ceil(0.8 * additional_membership_months)
```
For €1,000 requested => 10 additional months, next application no earlier than 8 months.
For €5,000 requested => 50 additional months, next application no earlier than 40 months.
The calculation applies to the **requested** amount even if the project ultimately receives less, and this must be unmistakably disclosed before initial submission and acknowledged again at award acceptance. Separate lawful agreements and actual disbursement are prerequisites. Subsequent terms run consecutively, not concurrently. Ordinary members may cancel on 10 days' notice before month-end unless independently bound by an enforceable grant agreement.

## Transparent state taxonomy (no fictional values)
- **Subscription billed / collected:** separately account for gross memberships, tax/VAT, refunds, costs for bundled services, restricted transferred net money, and fees. No assumption that full €250 flows into the Fund.
- **Recorded receipts:** bank/provider-confirmed transfers with unique bank reference and private evidence. Public page shows totals, not identities.
- **Ledger book balance:** receipts less paid expenses; NOT a bank-confirmed amount.
- **Bank custody:** statement balance with verified statement digest, as-of date, approver, and reconciliation difference. NEVER replace missing proof with zero or mark book alone as cash.
- **Committed funding:** outstanding enforceable signed awards versus unaccepted *proposed* offers. Their values are separately tracked.
- **Grant disbursement:** actual paid cash with bank payout confirmation, never a voted allocation or a mere proposed award.
- **Unallocated liquid balance:** may be shown only after legal activation, period-current reconciliation, no unreconciled reversals, no duplicate commitments and documented liquidity approval. Null means **unverified**, not €0.
- **Cost of administration:** actual allowed expenses, segregated from grants and audited with invoices.
- **Corrections:** append new reversal/correction entries; never mutate or erase historical financial entries.
- **Documentation:** publish amount, period, purpose, legally permissible recipient label, decision reference, completion percentage, redacted evidence hash and correction links. Retain raw documents privately according to GDPR and fiscal retention law.

## Audience permissions
- **Public / prospective:** read-only aggregate financial report `/fund/transparency`, published verified non-personal disclosures, policy `/fund/procedures`. Not allowed raw SQL direct financial SELECT or offer identification.
- **Verified member:** personal proposal `/fund/apply`, eligible multi-project ballot `/fund/vote`, existing `/proposals` founding needs vote, individualized `/awards` grant-consent history, aggregated transparency.
- **Existing marketplace Super Admin:** protected `kontamou.site/admin/mazi/fund`, receipt and audit inventory, reconciliation indicators, funding-round queue and obligations; authenticated by established session AND persisted marketplace super_admin role. Separate MAZI admin accounts remain forbidden.
- **Independent accountants/auditors (future):** read-only time-bounded evidence, no payout or election management powers.
- **Financial writer/approver (future):** segregated role and two-person integrity for receipts and payouts, NEVER the public Edge key.

## Technical release checklist
- [x] Database financial reporting with zero inventing and verified role denies (migration 028).
- [x] Immutable audited business ballots, conflict checks and one per ΓΕΜΗ (029–030).
- [x] Minimum useful funding request and ΓΕΜΗ proposal uniqueness (031).
- [x] Isolated anonymous-read financial reporting Edge API (finance summaries only).
- [x] Isolated JWT-authenticated funded-proposal / vote service (no financial writer).
- [x] Member proposal and voting SSR routes, public financial page and fund policy.
- [x] Marketplace super-admin report view and no separate MAZI admin account.
- [ ] Run end-to-end consenting real verified business acceptance on a legally approved funded cycle.
- [ ] Independently sign off legal entity, consumer/professional law, grants/donations/crowdfunding classification and Greek tax/VAT/myDATA.
- [ ] Independently approved segregated account, cash collection and transaction reconciliation.
- [ ] Define actual €250 membership split and transparent Fund contribution accounting.
- [ ] Finalized electorate snapshot, freeze results and appeal protocol; get independent fairness review.
- [ ] Actual accounting entries, payout service, idempotent bank callbacks and dual-approval.
- [ ] Programmed recipient milestone/evidence submissions and audited project close-out.
- [ ] Pass CI, Vercel preview production-like QA, accessibility and privacy review.
- [ ] Separate written authorization before real financial activation.

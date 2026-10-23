# MAZI retention and allocation policy — v1 / legal review required

Date: 2026-10-23. This document specifies a product policy **subject to execution of binding terms and specialist Greek legal/tax review**. No member is charged and no support award or repayment/collection becomes enforceable by publishing this file.

## 1. Member lifecycle without a grant

- Monthly subscription: €250 per running calendar month, subject to final signed commercial agreement and applicable tax determination. The member receives the separately agreed KONTA MOY HUB PRO + marketing-services entitlements; these do not equal cash.
- The ordinary membership can be terminated by the member without a minimum stay.
- Notice received **at least ten calendar days before the end of the current Greek-local calendar month** makes cancellation effective at that month-end. If received later, renewal continues for the next month, so cancellation is effective at the end of that next month if otherwise permitted. Preserve evidence of notice, transmission/receipt, period and member identity.
- Effective cancellation remains subject to an additional commitment **only** if a separate valid grant agreement has been executed and financial support actually disbursed. Notice may be lodged in advance; service must display earliest lawful cancellation date and not conceal notices.
- Define precise Athens-local 23:59 cutoff for notice dates in final contract, including weekends and month-end edge cases; no silent backdating or involuntary charges.

## 2. Conditional non-repayable development support

Name: **μη επιστρεπτέα αναπτυξιακή ενίσχυση** (conditional non-repayable development support). Do not call it a loan. Grant support does not constitute an investment/deposit or automatic right to a distribution.

- Any Need/Project submission requires recorded, versioned acknowledgment **of the prospective formula and the requirement for a separate agreement**. The founding needs-assessment cycle has €0 budget. This first acknowledgment creates no paid stay or payout right.
- After collective allocation, but before requesting/disbursing the democratically assigned amount, present an **individual award acceptance** specifying the legal recipient, verified entity, amount requested, amount assigned, actual commitment months, precise dates, conditions, consequences of breach, amount and VAT treatment and the specific policy/contract versions. Require a distinct affirmative acceptance/signature and tamper-evident immutable evidence. No pre-ticked checkboxes or blanket consent.
- The agreed formula uses the original **requested** grant amount, not the finally assigned amount:
  `additional_months = CEIL(requested_amount_cents / 10000)`, since 40% of €250 = €100.
  All calculations use integer cents and calendar months, not 30-day periods.
- Retention begins upon **actual disbursement**, appended after any existing unexpired grant commitment (no double-counting of months). The projection and exact extension date are shown to recipient before final acceptance.
- Reapplication after a successfully received award only if at least `CEIL(additional_months * 0.8)` whole additional months have elapsed. The 80% clock starts at the relevant grant commitment start, which is at/after disbursement, and is measured independently of ordinary proposal/cycle date.
- A new award received while another commitment remains adds its months sequentially, not concurrently. Never rewrite existing acceptance records.
- One previously successful recipient may reapply under these conditions; the formula imposes no categorical lifetime ban.
- Example: €5,000 requested -> 50 extra months -> earliest new application after 40 months. €10,000 -> 100 months -> after 80 months. These unusually long terms require particular legal review before activation.
- A smaller **assigned** amount versus requested amount does NOT automatically shorten commitment under the stated policy. Show this discrepancy prominently before the recipient decides whether to accept. A fair proportional alternative may need explicit separate approval, not an undocumented software change.

## 3. Funding decisions & first-time priority

- At submission, classify a grant request as `first_time_support_request` only if the verified **legal entity** has submitted no earlier requests in a **fund-allocation** cycle (including requests rejected/not funded). Do not count the nonfinancial founding needs-assessment cycle as a funding request.
- Freeze the first-time label; once a first request is submitted, subsequent requests become repeat requests. Do not backdate or grant a fresh first-time status because no money was awarded.
- Flag first-time requests to members/reviewers as a published priority class and **sort them first** in Super Admin review queues. Continue to apply identity, conflicts, proof, objective eligibility and available-budget rules; do not silently fabricate a voting outcome or disqualify repeat applicants.
- A previous **disbursement** (not merely a supported vote, selected proposal or submitted request) is the event that activates the 80% reapplication lock. Track one legal entity across its accounts.
- For future fund rounds, enforce cooldown transactionally in the backend and database, not solely in UI.

## 4. Legal and economic safeguards to resolve

- Lawyer to examine whether the compulsory €250 subscription following financial support creates disproportionate constraints, disguised compensation or penalties under Greek Civil Code articles 281 and 409. A €10,000 grant produces 100 months and an illustrative €25,000 in future membership invoices at the unchanged price: material commercial exposure.
- If a grant recipient ends membership early, do **not** assume indefinite forced membership or automatic recovery of all support. The grant agreement must expressly specify legitimate, proportionate consequences and any exceptions (business closure, force majeure, death, relocation, dissolution), notice rights and accessible remedies. Conditional recoupment for an unfulfilled term is conceptually different from ordinary repayment of a loan.
- Lawyer and accountant must approve operator, beneficiary contract, tax/financial classification, whether any state-aid regime is relevant (privately funded aid is not automatically EU state aid), custody/segregation, nonprofit/profit setup and fiscal issuance.
- Membership fee cannot be labelled a grant contribution or collected on behalf of a fund until the fund's financial structure is approved.

## 5. Implementation stages / present state

**Implemented in source:** pure calculation functions and regression tests; versioned prospective acknowledgment at Need submission; PostgreSQL-ready migration for immutable acknowledgment timestamp and first-time label; Super Admin priority sort and badge.

**Required activation sequence:** apply reviewed DB migration -> deploy matching MAZI Edge function -> deploy both MAZI frontend and marketplace Admin -> verify production schema/Edge alignment, regressions and real consenting member. Do not deploy frontend before migration/Edge.

**Not yet built:** real paid membership cancellation/renewal engine, verified grant award/accepted contract, actual disbursement, release/recovery mechanics, future multi-project voting, financial reapplication cooldown enforcement against real award records. Finance remains `finance_activated=false`, fund budget €0.

# MAZI Collective Marketing Programme — v1 proposed
Updated: 2026-10-27. Status: DESIGN / NO ACTIVE BILLING / NO ACTIVE CAMPAIGNS.

## Four independent benefits
1. Business Growth Fund with its own allocation, votes and awards. 
2. Collective marketing pool: distinct aggregate resources, **not** a member advertising wallet.
3. KONTA MOU HUB PRO according to actual hub availability and separately published offer.
4. 250 monthly on-demand service tokens per active paid cycle, expiring at cycle end without rollover, sale, transfer or cash-out.

## Illustrative monthly allocation before VAT
40% fund (€100); 20% collective marketing (€50); 25% services/HUB PRO (€62.50); 10% operations (€25); 5% reserve and compliance (€12.50). €250/month excludes applicable VAT in this example. This is illustrative, not an existing billing rule. The special award retention formula has its own contract and must not silently derive financial allocation from these marketing illustrations.

## Internal marketing budget
Proposed: 60% digital paid media, 15% local/offline placements, 15% creative production, 10% measurement/experimentation. These are sub-budgets only after an approved, reconciled marketing allocation.

## Enforcement before enabling billing or public claims
- Separate VAT-aware invoice, collection, refund and chargeback calculations.
- Marketing ledger must be append-only double-entry or equivalent with invariant checks, unique payment allocations, idempotency keys, compensating reversals and supporting evidence. No aggregate of synthetic data as money.
- Distinguish paid, pending, refunded, committed and available funds. Apply a spend lock and hard budget cap before sending external advertising orders.
- Audit authorization, eligibility, creative permission, and actual provider billing. No ad-account API key exposed to members.
- Reserve enough budget for on-demand service delivery, while treating tokens as service units not money; do not assume that €250 token value costs €250 in cash.
- Public transparency: funds received, eligible committed balance, actual settled expenses, opening/closing balance, documented corrections, monthly receipts metadata, anonymized aggregate results.
- Private member reporting: actual eligible campaign inclusion, creative approval and verified source metrics only. Show unavailable data as unavailable, not zero if feed is absent.
- Fair exposure: consider membership, approved assets, available supply, relevant sector/geography, recent exposure, conflict checks, opt-outs, and exclusion reasons. No guaranteed results or private ad budget.
- Consent and law: GDPR, digital ad transparency, IP permissions, audit-retention schedule, opt-outs and marketing law. Research contact data must not be repurposed for advertising.
- Quarterly member input may influence budget priorities; the super-admin controls compliance and execution. Every exception should be reviewable.
- Keep existing `/admin` admin boundary at KONTA MOU; a future marketing admin must be implemented inside the authenticated super-admin system rather than an exposed parallel login.
- Keep public and member pages labelled as proposed until the contract, payments, provider integration, testing, legal review and go-live approval exist.

## Activation checklist
[ ] Legal/commercial terms approved and consent captured independently of interest application
[ ] Tax model signed off and fee presentation reconciled with VAT
[ ] Invoice/payment accounting connector and refund idempotency proven
[ ] Append-only campaign budget/settlement ledger and RLS/test evidence
[ ] Provider credentials/scopes established, campaign approvals and creatives licensed
[ ] Budget caps, pause controls, audit, transparency and monthly member reports tested
[ ] Marketing fund finances reconciled against banking/provider statements
[ ] Only then: remove the non-economic pilot banners and enable financial state

The canonical, live-authoritative member service catalogue is /services/catalogue backed by mazi_service_catalog. Do not duplicate service pricing in the marketing module.

# ΜΑΖΙ — ΚΟΝΤΑ ΜΟΥ Collective

Standalone Next.js application for the proposed member-owned economic solidarity and development initiative.

**Intended host:** https://mazi.kontamou.site  
**Repository location:** `mazi-app/` (outside the marketplace npm workspace)  
**Vercel:** Separate project with Root Directory `mazi-app`; no production marketplace deployment changes required.

## Phase 0 — Safe foundation

- Premium Greek-language public site.
- Funding principles, proposed founding charter and non-commercial informational disclosures.
- Interactive member-flow simulation with draft proposals, support choices and a membership-budget preview.
- Simulation only: no network persistence, no financial collection, no user accounts, no membership registration or actual grant allocation.
- No survey contact imports; researcher-to-marketer consent boundaries stay intact.
- Client demo data is explicitly fictional, with no claims of active membership or awards.

## Setup

From `mazi-app/`: `npm install`, `npm test`, `npm run build`, `npm run dev`.

## Gated next phases (not yet implemented)

1. Greek legal/tax review of the Collective's entity, subscription treatment, pooled grants, governance and disbursement contract.
2. Member verification, identity/RLS isolation, consent ledger and business ownership checks.
3. Atomic budget/escrow or segregated fund ledger with idempotency, two-person approval and immutable audit events.
4. Proposal intake with documents in private storage, eligibility screening and conflict-of-interest declarations.
5. Snapshot-frozen one-member-one-vote eligibility with linked-entity safeguards, anti-sybil controls and public rules.
6. Allocations, staged payouts based on invoices, receipts, recusal and appeal process.
7. Actual email opt-in limited to lawful outreach, with no reuse of research survey contact information without valid marketing consent.

**Safety:** No live payment, vote, pledge, grant or crowdfunding functionality should be switched on until regulatory, bank/accounting, security and governance readiness has been formally approved.

# MAZI individual award consent / architecture gate
Updated 2026-10-23. Financial operations remain deliberately disabled.

## Recipient-specific future award
A real funding award is never created by receiving a vote, filing a Need, or enrolling as a MAZI business. A legally authorized marketplace administrator or future compliance service must separately issue a complete, individually reviewed offer **after** the fund's legal activation, the final allocation, and verified recipient eligibility.

SQL migration `014_award_acceptance_foundation.sql` creates:
- `public.mazi_grant_award_offers`: at most one immutable offer per proposal, only for verified GEMI businesses and **closed, finance-activated fund-allocation rounds**. Requires exact requested and assigned amounts, required duration based on requested amount, 80% cooldown, €250/month illustration, full 400–20,000 character agreement text, evidence of legal review, immutable SHA-256 digest of exact text, recipient identity and expiry. Database rejects offers exceeding remaining cycle capacity. **No service role or browser INSERT/UPDATE/DELETE privileges are granted to this table.**
- `public.mazi_grant_award_acknowledgements`: insert-once, immutable recipient confirmation of the exact agreement hash, version and verified Supabase user. Owner scoped through the JWT-verified MAZI Edge gateway, with no direct browser table grants. DB rejects acceptance after expiry, identity change, or financial deactivation. Service role has only SELECT and INSERT; never UPDATE or DELETE.
- Corrected `mazi_private.proposal_first_support` to assess prior funded-round applications by the **verified GEMI legal entity**, not arbitrary Supabase account. Under the same legal entity, changing account must not reset first-time priority.
- All financial ledgers, payout adapters and renewals remain untouched.

## Interaction
The private member route `/awards` is reachable only by a verified business. It will show **no pending offer today**, because founding-cycle fund allocation and finance are disabled. When real offers are issued, it displays their entire text, exact SHA-256 reference, requested/assigned discrepancy, retention months, earliest reapplication delay, possible future membership charges and expiry. A valid user explicitly ticks three unchecked boxes, acknowledging the requested-amount basis, that more legal/commercial steps are required, and the complete individual terms. The Next.js server action forwards them via the Edge gateway. The DB again checks the recipient, policy and exact hash.

The acknowledgement is an *affirmative preliminary recipient record*, not on its own a qualified signature, final executed grant agreement, an authorization to debit a card, or a right to withdraw money. A separately counsel-reviewed and countersigned agreement and execution/custody procedures are required for payment activation.

## Future legal/commercial gates
- Final Greek legal review of very long binding membership periods, fair early termination/recovery exceptions, whether aid is a gift/income/state aid and business closures.
- Legitimate funding operator, sufficient contributed and segregated funds, final audited multi-project allocation, identity/ownership and fiscal review.
- An authorized Super Admin offer-creation workflow with eligibility and assignment verification, revocation and re-issuance policies, notifications and legal signature integration.
- Member billing lifecycle, 10-day notice service, consent evidence, and 80% cooldown enforced against actual settled disbursements.
- Payout orchestration: signed recipient agreement, separate admin approval, custody verification, reconciliation, audit trail, idempotency and fraud controls.
No features above are silently activated by this migration.

## Release ordering
1. Run the MAZI app regression suite and build on the exact candidate.
2. Apply migration 014 to live Supabase and verify only MAZI schema changes, RLS/grants and no rows altered.
3. Deploy matching JWT-verifying MAZI Edge gateway and read it back.
4. Merge GitHub PR and validate **both** the independent MAZI Vercel production app and marketplace Super Admin deployment at the same SHA.
5. No synthetic businesses, proposals or payouts are inserted into production.

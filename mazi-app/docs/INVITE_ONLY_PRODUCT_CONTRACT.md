# MAZI membership and fund product contract — 2026-10-23

This is a design decision and build contract, not activation of memberships, service credits, or the Growth Fund.

## Open interest, invitation-only membership
1. A business may express interest by Greek AFM without creating a MAZI member account.
2. Validate AFM checksum and request authorized GEMI registration details, reusing the existing KONTA MOY gemi_company_lookup_cache. If unavailable, stale, mismatched, inactive or missing, queue for human review; no invented or automatic verification.
3. The KONTA MOY marketplace Super Admin reviews registered entity and evidence that the applicant represents it. Admin can request information, approve or reject with reasons.
4. Approval plus verified legal entity, verified representative and verified contact makes the business eligible for a unique time-limited invitation to the MAZI onboarding portal.
5. Invited member must accept applicable terms; only then link the account to the approved application and legal entity. Do not create duplicate members; no separate MAZI admin role.

The current public OTP flow creates an auth user and then takes the application. It must be replaced with the new AFM-first flow as a complete, tested release, not disabled without a functioning replacement. Reuse authorized GEMI API keys; no global Supabase Auth settings changes affecting other KONTA MOY services.

## Member value and supplier
KONTA MOY is the proposed contracted marketing-service provider for MAZI members. Membership benefit is HUB PRO plus 250 EUR equivalent of KONTA MOY marketing services/credits. Credits are non-cash service entitlements, not deposits or withdrawable euros. Confirm the fee and billing period, the redemption catalogue and rate card, refresh cadence, expiry/rollover, and treatment of third-party advertising costs in the service agreement. The current vendor_plans table did not expose a canonical hub_pro plan; mapping must be verified rather than invented. A credit ledger must attach redemptions to actual delivered work and fiscal records; no credits or plan subscriptions are activated by this specification.

## Growth Fund
Intent: business development support without an ordinary repayment obligation, approved by reviewed eligible members and subject to accountable allocations. Greek Civil Code 806 defines a loan by its repayment duty, so do not legally label a never-repayable grant as a loan until specialist Greek legal advice confirms the appropriate construction. The actual funding operator, tax treatment, accounting, contracts, segregated custody, governance, regulatory conditions, conflicts and independent review must be resolved before any fund contributions or disbursements. Keep existing zero budget and finance deactivation intact.

## Voting and shared services
Preserve one equal legal-entity voting entitlement. Build multi-project allocation voting rather than the present single support ballot per cycle, with conflicts, immutable recording and finalized results. Continue later integration of shared campaigns, collective procurement and representation.

## Implementation acceptance
- Real provider GEMI lookup from AFM; checksum alone never confirms identity.
- Unique open application per company; admin retains sole onboarding authority.
- Invitation verified and accepted only by the approved business contact.
- Real HUB PRO and marketing service entitlements only on an authorized commercial activation.
- No fake members, emails, ballots, credits, fund balances or finance operations.
- Replace production authentication atomically after end-to-end tests, not before.

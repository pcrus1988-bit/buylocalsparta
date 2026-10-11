# KONTA MOY — plan-specific vendor agreement generators (2026-10-11)

## Status / legal gate
Version: 2026-10-11-v1. **DRAFT, pending counsel and accountant review**.
Do not email for signature, collect signatures, verify gov.gr references or activate a newly generated plan agreement in this revision. Server-side Finance actions block that path for new draft plan records, while legacy verified agreements retain their lifecycle.

## Plans covered

| Market | Plan | Contract kind | Source |
| --- | --- | --- | --- |
| Expansion HUBs | CLAIM | Non-commerce free listing | hub-expansion-plans.ts |
| Expansion HUBs | PRESENCE | Non-commerce enriched profile/media/leads | hub-expansion-plans.ts |
| Expansion HUBs | SHOP | Marketplace merchant | hub-expansion-plans.ts |
| Expansion HUBs | GROWTH | Marketplace merchant | hub-expansion-plans.ts |
| Expansion HUBs | PRO | Marketplace merchant | hub-expansion-plans.ts |
| Sparta | Monthly | Marketplace merchant | /join/sparta |
| Sparta | Annual | Marketplace merchant | /join/sparta |
| Sparta | Founding Partner | Marketplace merchant, 36-month protected period | /join/sparta |

Sparta has distinct terms from expansion HUBs. New agreements snapshot the plan code, its market, version, billing cycle, fees, commissions and entitlements. Existing signed agreements are immutable and are not rewritten.

## Admin workflow

1. Open /admin/finance/agreements, then Plan agreement generator.
2. Select the exact plan and annual/monthly cycle.
3. For an expansion HUB, provide the saved HUB application reference. Its plan/cycle must match. The preview uses the approved setup-fee amount, including any onboarding reward.
4. For Sparta, provide a vendor ID or public ID. Preview comes from the vendor record.
5. Download the marked DRAFT PDF. Nothing is activated or recorded as accepted.
6. For a commerce vendor provisioned with a vendor record, use Governed agreement lifecycle to create the merchant contract. Economics are locked to the selected plan. Expansion HUBs additionally require a linked application in verified/approved/converted status with the identical plan and billing cycle.
7. Creation saves a versioned snapshot and generates the unsigned PDF in the private vault. Sending, signature uploads, gov.gr verification and activation remain blocked while legalReviewStatus is pending_legal_review.

## Legal distinctions and open release gates

- CLAIM: Free directory without checkout or seller obligations. Optional external iframe must respect site framing policies and cookie/consent implications.
- PRESENCE: Paid directory services, media and enquiries; no checkout, settlements, inventory or shipping SLA.
- SHOP/GROWTH/PRO and Sparta tiers: Governed marketplace contract plus plan-specific commercial and entitlement appendix.
- Legal counsel should review merchant-of-record roles, DSA/GDPR, media/iframe rights, renewal and refunds, notice periods, dispute jurisdiction and termination.
- Accountant must approve VAT, invoicing, myDATA and settlement treatment.
- NOT included: public versioned CLAIM/PRESENCE acceptance, durable consent evidence, and automatically applied plan-change contracts. These remain separate release gates.
- For launch, create a new, approved template version after review and generate new drafts. Never treat old unapproved PDFs as retrospectively valid.

## Validation

- npm run test:vendor-plan-agreements
- npm run check
- npm run build
- Preview all plans from controlled verified records and cross-check /hubs/join and /join/sparta.
- Reject cross-plan/cycle input; keep all existing signed documents unchanged.

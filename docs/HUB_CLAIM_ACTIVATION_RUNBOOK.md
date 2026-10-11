# HUB CLAIM — release and first live application runbook

## Scope
CLAIM is a free, non-commerce listing in the 130 expansion HUBs. Its existing prospect record is the source of truth for the initial directory profile. This release **does not** provision a selling Vendor account, inventory, orders, payments, fiscal access, or the paid 3-day trial.

## Authorized workflow
1. Applicant submits `/hubs/join/apply?plan=claim`. The prospect is `pending`; no public page exists.
2. Admin reviews in `/admin/applications` and moves through `contacted → qualified → verified`.
3. Before advancing `verified → approved`, Admin **independently** checks legal/business representation. A ΓΕΜΗ company match or possession of an email alone does not prove ownership. Record non-sensitive evidence references and confirm the new ownership-verification checkbox. Never approve from a screenshot alone.
4. On approval, the existing transactional email workflow sends the applicant a link to `/hubs/claim/<public_id>`. If delivery fails, the approved row exposes **Resend CLAIM activation email**. Admin cannot manually convert a CLAIM prospect.
5. Recipient signs in or registers with the exact application contact email **and verifies the KONTA MOY account email**. Client UI never authorizes this action: the server performs a fresh active-user, verified-email, owner, status, and plan check in one serializable PostgreSQL transaction.
6. On acceptance, `hub_expansion_prospects.owner_user_id` is set and status moves to `converted`. Only **this** combination publishes the dynamic `/hubs/<hubSlug>/business/<public_id>` page.
7. The owner can open `/vendor/claim` for category, phone and URL changes. ΓΕΜΗ legal name, ΑΦΜ, official address, market routing, commerce enablement, payouts and subscription settings cannot be edited there.

## Operational safety
- No current applicant has been approved or automatically published by the code change.
- The migration `0297_hub_prospect_vendor_trial.sql` already supplies nullable `owner_user_id`; no database migration or pricing change is required for the new CLAIM pages.
- Existing commercial `PRESENCE/SHOP/GROWTH/PRO` trial workflow remains independent.
- Public responses never render the application email, AFM, private application notes or applicant identity. Generated metadata only exists for converted, owner-bound CLAIM profiles.
- Publication is immediate after owner acceptance. Admin should review the contact phone and official address with the business before approval; an email account match is not a substitute for that review.
- For companies outside exact HUB-city matching, configure and verify the server-side `GOOGLE_MAPS_GEOCODING_SERVER_KEY` before promising nationwide geographic coverage.
- If duplicate historical research-vendor profiles exist for the same business, manually inspect canonical URL/SEO conflicts before approval; a future canonical-identity consolidation should precede broad-scale CLAIM marketing.

## Acceptance checklist
- [ ] `node --experimental-strip-types scripts/verify-hub-expansion-onboarding.ts`
- [ ] `node --experimental-strip-types scripts/verify-hub-claim-lifecycle.ts`
- [ ] Next.js production build, workflow checks, and Vercel preview green
- [ ] `pending/verified` claim URL returns 404; `approved` is still absent from public directory
- [ ] Invalid/unsigned-in/unverified/different-email user cannot claim
- [ ] Admin cannot advance CLAIM `approved → converted`
- [ ] Correct user accepts exactly once; repeated acceptance is idempotent
- [ ] Only accepted, owner-bound CLAIM shows public page/canonical URL
- [ ] Owner can edit allowed fields; other account and anonymous caller cannot
- [ ] Claim owner cannot access paid vendor order/catalogue/finance paths
- [ ] Trial and paid plan acceptance unchanged
- [ ] Email delivery, bounce/suppression, and resend tested with controlled operator accounts

## Rollout policy
Keep the first production CLAIM unapproved until the deployment is READY, verification evidence is recorded, and a controlled signed-in test is successful. Do not auto-convert or backfill pending applicants.

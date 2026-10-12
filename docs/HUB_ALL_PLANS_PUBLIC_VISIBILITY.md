# HUB public directory — verified plan-wide activation

This module complements CLAIM and the governed GEMI research directory. The public HUB pages must show **eligible activated businesses from all `/hubs/join` subscriptions**, not CLAIM alone.

## Live eligibility

| Program | Public-directory condition | Marketplace checkout |
| --- | --- | --- |
| CLAIM | `plan_code=claim`, converted, verified owner, canonical `public_slug` | Never |
| PRESENCE | Converted, verified owner, linked active/public non-demo vendor with stable slug | Never |
| SHOP / GROWTH / PRO | Converted, verified owner, linked active/public non-demo vendor with stable slug | Independent marketplace enablement required |
| Prospect, applied, approved only, trial, demo, invited, verification pending, declined | Not displayed as active HUB partner | Not enabled by public listing |

Paid-plan profiles use `/hubs/{hubSlug}/business/{vendorSlug}` and a HUB-scoped neutral business profile. Do not send customers to `/vendor/{slug}` for prelaunch expansion HUBs because the existing vendor route uses the Sparta market scope. Distinguish a verified directory member from a checkout-capable marketplace vendor.

Locations on `/choose-location`, city HUB landing pages, the city directories and the core sitemap must recognize eligible businesses from every plan, while still treating unverified/pending GEMI entries as unpublished and unreleased. Search/category/pagination pages stay noindex. Do not elevate an expansion HUB's `shopping_enabled` or `is_live` flags merely because a directory has a verified paid or CLAIM record.

## Security and validation

- An administrator approval **without** verified owner + converted status + active non-demo public vendor is insufficient to publish a paid HUB partner.
- NEVER index a paid trial or show pending applications as active partner listings.
- No direct display of application email, private tax number, GEMI dossier, or other research-only contact fields.
- The pure `hub-partner-eligibility.test.ts` tests all four supported paid codes and fail-closed edge cases.
- Run `npm run test:hub-gemi-assignment` and `npm --workspace @buy-local-sparta/web run build`.
- Confirm the first verified expansion paid partner, once onboarded, appears in the HUB landing page, its directory, `/hubs/businesses`, location chooser and core sitemap, while a pending paid trial does not.
- Public `/vendor/{slug}` remains Sparta-specific until a separately reviewed multi-market storefront resolution exists.

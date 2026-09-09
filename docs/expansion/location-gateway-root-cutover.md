# Location gateway root cutover

This document governs the first safe cutover step that can make `/choose-location` the primary customer entry gateway without changing the existing Sparta storefront or deep-link behavior.

## Current scope

The enforcement is intentionally **root-only**.

When `BLS_LOCATION_GATEWAY_ROOT_ENFORCEMENT_ENABLED=true`:

- `GET /` and `HEAD /` with no `km_locality` cookie redirect temporarily (`307`) to `/choose-location`.
- `GET /` and `HEAD /` with `km_locality=sparti` continue to the existing Sparta homepage.
- A stale, invalid, prospect, or other non-Sparta locality does not fall through to Sparta; root redirects back to `/choose-location`.
- Deep links such as `/shop`, `/category/*`, `/product/*`, `/join`, `/vendor/*`, `/admin/*` and APIs are not redirected by this cutover step.
- `/choose-location` is never redirected by this rule, preventing a gateway loop.

When the variable is absent, empty, or not equal to `true`, the rule is disabled and behavior remains exactly as before.

## Why only Sparta may pass root today

Sparta (`KM-HUB-015`, gateway slug `sparti`) is still the sole live legacy marketplace. Other HUBs may be visible for research, prospecting, claim/onboarding and expansion status, but they must not accidentally inherit Sparta's shopping surface.

The `km_locality` cookie is the existing server-readable location decision written by the location gateway. No second locality cookie is introduced.

## Activation checklist

Do not enable the flag merely because the code has been merged. Enable it only after all of the following are true:

1. `/choose-location` is healthy on the target deployment.
2. Sparta selection writes `km_locality=sparti` and returns to `/` successfully.
3. A first-time root visit redirects to `/choose-location` when the flag is enabled.
4. `/shop`, product/category SEO URLs, `/join`, authentication, vendor/admin surfaces and APIs remain reachable directly.
5. The location gateway acceptance check is green.
6. Production monitoring and rollback access are available.

## Rollback

Set `BLS_LOCATION_GATEWAY_ROOT_ENFORCEMENT_ENABLED=false` (or remove the variable) and redeploy. No database rollback is required because this enforcement layer is request routing only.

## Later expansion

Do not broaden this root-only rule into general path enforcement until public shopping surfaces consume a centralized `MarketContext` and each live HUB has an explicit route/storefront strategy. The 131-HUB registry remains the identity source; operational market identity remains `markets.id` through the HUB/market binding layer.

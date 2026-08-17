# Buy Local Sparta — Build 0.27.0 Report

## Scope

Build 0.27.0 converts the production Next.js customer account from a descriptive shell into an authenticated executable customer surface while preserving the existing marketplace Core and the 0.26.1 consistency hardening.

## Implemented

- `/login` customer sign-in over `InMemoryAuthService` for development/preview execution.
- HttpOnly, SameSite customer session cookie with secure-cookie enforcement in production.
- Session-specific CSRF protection on account mutations and authenticated checkout.
- Trusted visitor-scoped login rate limiting using the internal `x-bls-visitor` identity set by Next.js proxy.
- `/account` dashboard with customer-linked order history, saved products, saved searches, grouped notifications, recommendations, recent views and privacy preferences.
- Product save/unsave with default back-in-stock/price-drop alert preference baseline.
- Product recently-viewed recording when the authenticated customer opens a product page.
- Saved-search creation from the production `/shop` surface with canonical baseline matching.
- Notification mark-all-read action.
- Recommendation and recently-viewed opt controls; disabling recently viewed clears the existing recent history through the Core service.
- Governed privacy-export request creation and account notification.
- Authenticated checkout attaches Core `customerId` and projects the order into the account; guest checkout remains supported.
- Account availability and saved-search matching use stock freshness plus Fair Vendor eligibility rather than raw on-hand quantity only.

## Security and deployment boundaries

The production-web account runtime is lazy. Merely importing/building the Next.js application does not instantiate authentication state or require `BLS_AUTH_SECRET`.

The current executable account adapter is in-memory. It is suitable only for local development or an explicitly enabled single-instance preview. Multi-instance/serverless production must use the existing PostgreSQL identity/session and customer personalization repositories. To prevent accidental misuse, production refuses the ephemeral account runtime unless `BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME=true` is explicitly set. This override is not for real customer traffic.

Demo customer credentials are automatically available only outside production, unless `BLS_ENABLE_DEMO_ACCOUNTS=true` is explicitly configured.

## Verification

After implementation:

- 209/209 Core tests passed.
- 28/28 immutable migrations verified by checksum.
- Project consistency gate passed, including new account-session invariants.
- 4 development UI syntax checks passed.
- 6 development accessibility structural checks passed.
- Full HTTP critical-journey smoke test passed.
- 39 production-web TypeScript/TSX files passed syntax transpilation with zero errors.
- A direct runtime proof passed: authenticate demo customer → save product → save search → create checkout with `customerId` → account dashboard contains the saved state, order and notification.

## Still gated

- Real `next build` under installed Node 24 / Next.js dependencies.
- PostgreSQL-backed account/runtime cutover for shared durable production sessions and personalization.
- Production email verification/password-reset flows.
- Real PSP/payment capture and the existing legal/accounting launch gate.
- Remaining customer surfaces: detailed consolidated order tracking, returns/recalls, advice/messages/appointments, addresses/profile and tax-document UI.

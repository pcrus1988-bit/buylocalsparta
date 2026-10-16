# KONTA MOY Android — Full Marketplace programme

**Target:** A production-quality Android counterpart to KONTA MOY, using the **same** canonical catalogue, approved vendor offers, inventory, customer identity, order ledger, fiscal records and existing governance. No shadow marketplace, vendor leaks, second checkout or fabricated nearby availability.

**Implementation:** `mobile/` (Expo 57) in draft PR #1553. The native Android source and the website live in one repository. Production authentication/FCM schema migrations remain gated until independently reviewed.

## Functional coverage — current state

| Domain | Native Android | First-party secure browser bridge | Remaining to full native parity |
| --- | --- | --- | --- |
| Home/navigation | Five persistent Android destinations and KONTA MOY branding | N/A | Localization/accessibility/device analytics |
| Product discovery | Real indexed catalogue search, real canonical variant IDs, saved favourites, exact product links | Existing detail/size selector/offer price/add-to-cart | Category hierarchy, facets, images, offer-price projection, infinite scroll |
| Stores/HUBs | Store-search launcher, Nearby, area selector links | Approved public vendor and brand directories | Native server-driven store/HUB directory and audited profiles |
| Shopping lists | Offline SQLite, quantities, completion, moving between lists, OS share, explicit account wishlist copy | Website saved products | Conflict-resolving bidirectional sync, named lists, revision control |
| Wishlist | Native exact-variant selection and saved-product import/export behind signed-in session | Website wishlist | Native account-auth activation, stock/price watches |
| Cart | Native navigation and clear active-cart transition | Existing cross-vendor cart in browser session | Backend-owned authenticated cart API, cross-device reconciliation, promo rules |
| Checkout | Native explanation and safe Android Custom Tab | Existing checkout, payment, returns, pickup/delivery | Native order summary and secure payment SDK/redirect while retaining existing order/fiscal engine |
| Orders | Native authenticated snapshot in source, not enabled live | Existing order tracking and support | Signed-in order timeline, courier status, returns/refunds, disputes |
| Pickup | Native readiness indicator in source and instructions | Actual secured pickup QR from original order page | Native authenticated QR/receipt with replay and expiry protection |
| Nearby | Foreground-only verified shops and fresh local-pickup stock; list matches stay on device | Official shop product details | Physical vendor-coordinate QA and true opted-in production field tests |
| Notifications | Local opt-in while app open; FCM registration/transactional outbox staged | Browser account preferences | Firebase project, tested Android delivery, consent/revocation, allowed recurring background triggers |
| BAZAAR / brand directory | Discoverable via services | Existing public pages | Native listing API and product offer filters |
| Sport & Fit Intelligence | Deep link from catalogue to eligible product | Product-page intelligence overlay | Native deterministic fit UI powered by governed Sport & Fit DB |
| Try-On Me | Link to eligible clothing product | Existing authorized product-page try-on | Native consent/photo handling, privacy lifecycle, generation safeguards |
| Vendor marketplace | Entry in services | Existing merchant sign-in and dashboard | Separate vendor role navigation, seller isolation and approval workflows |
| KONTA MOY FISCAL | Entry in services | Existing `/timologio` service | Dedicated mobile invoicing only when fiscal/audit security and AADE workflows permit |
| Research Observatory | Entry in services | Existing public research portals | Appropriate native reader with aggregation/confidentiality controls |
| KONTA MOY × PosoKanei | No native implementation claimed | Do not guess URL/endpoint | Verify independent production API route, licensed data, supermarket preferences and split basket before integration |

**Browser handoff is a deliberate temporary supported feature, not native completion.** Android Custom Tabs keep payment, password, cookies and merchant data in the first-party browser experience. The native app never synthesizes a paid order or treats a local wishlist as a live cart.

## Required backend contracts for true native commerce

1. **Mobile authentication:** scoped customer PKCE, one-use code, hashed refresh rotation, device listing/remote revocation and recovery. Keep current migration disabled until signed APK + real-device redirect verified.
2. **Catalogues and stores:** indexed search, eligibility, approved media, family/variant/size, available vendor offers, taxes and stock freshness from the shared canonical schema. Shop profiles must expose only approved public data.
3. **Canonical cart:** versioned server-side customer/guest cart with idempotent item updates, server validation of seller/stock/prices, checkout quotes and exact persisted order handoff. This is a **new integration layer**, not a local independent cart.
4. **Payment and fiscal:** use existing authorised Mollie/payment and KONTA MOY FISCAL/AADE ledger, never client-assume success, store payment keys or bypass server quotation.
5. **Pickup/fulfilment:** server-owned QR, short-lived scoped tokens, no client QR synthesis, signed vendor scan, tracking, returns and refunds.
6. **Push consent:** separate transactional and marketing consent, live session checks, encrypted FCM tokens, no merchant freeform payload. No advertising-only background location.
7. **Merchant roles:** strictly role-scoped vendor dashboards and merchant RLS; never reuse customer bearer on vendor-owned actions.
8. **Compliance/observability:** GDPR deletion/consent, retention, accessibility, Greek locale, crash redaction, synthetic non-production QA accounts, Play Data Safety; alert on performance/error rates.

## Milestone and verification gates

**Current incremental release (0.3 development):** Native catalogue browsing with exact product links, stores, basket bridge, lists, home dock, service directory and official brand assets. Android CI must pass strict TypeScript, Expo version validation, JS export, policy tests and a signed standalone Preview APK. The separately installable Preview package preserves data in the customer's existing installation.

**Next (native commerce 0.4):** Audited offer price/media projections, native categories/filters, store cards and cached search results; QA against real eligible catalogue while maintaining bounded query latency and source-of-truth stock rules.

**Next (account/fulfilment 0.5):** Database migrations under governed deployment, signed APK PKCE and device revocation, orders/pickups/returns timeline, real-device QR tests.

**Next (transactional 0.6):** Unified server-side cart, order pricing/stock reconciliation, native checkout redirect and confirmation. Never enable an alternate client checkout outside existing payment/fiscal engine.

**Next (intelligence and operations 0.7+):** Sport & Fit native views, Try-On eligibility/consent, notifications on true user-owned events, approved vendor mode, and verified PosoKanei integration.

**Store release (1.0):** Stable Android signing keys, forward-compatible migrations, crash-free physical-device regression matrix (Android 13/14/15+), Play privacy review, staged opt-in rollout with backout plan. No background marketing geolocation.

## Before handing anyone a new APK

- Do not overwrite the installed debug-key build with an APK signed by an unrelated ephemeral key: Android will reject updates or uninstall would erase the existing SQLite lists.
- Use `COMPANION_PREVIEW_APK=true` and package `site.kontamou.companion.preview` for side-by-side testing until durable signing is configured.
- Confirm GitHub native Gradle APK artifact **contains JavaScript bundle** and passes `apksigner verify`.
- Confirm every new native screen is reachable by the app dock and first-party checkout links open only allowlisted, verified KONTA MOY URLs.
- In Preview, browser account fallback is available; PKCE login is deliberately disabled because preview uses a distinct deep-link scheme.
- Pass two flows on a physical phone: (1) offline add → quantity change → completion → move → restart → share; (2) online catalogue search → canonical product → wishlist → real product page → secure cart. No test should attempt payment with live customer credentials.
- Record any limitation as not yet implemented; do not claim Android-wide parity based on shell links alone.

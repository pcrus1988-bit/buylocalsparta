# KONTA MOY Companion — Android

## Verified Android development milestone — 16 October 2026

- **Reproducible dependencies:** `mobile/package-lock.json` committed. GitHub Actions passed `npm ci`, TypeScript, Expo SDK 57 compatibility and `npx expo export --platform android`.
- **Official identity:** The exact website wordmark is used to generate `mobile/assets/icon.png` and `mobile/assets/adaptive-icon.png`; Android launcher, splash and Companion home screen are configured.
- **Account wishlist:** The customer can explicitly copy canonical saved variants *from the website to the Android offline wishlist* and back *from the Android offline wishlist to the website*. Both are add-only, with no implicit deletions; generic shopping notes stay local. Not automatic conflict-aware sync.
- **Local privacy reset:** The user can clear offline lists, reminder history and location/marketing preferences independently of website account data.
- **Transactional order notifications:** Three isolated migrations + strict-gated service code provide opted-in real order/pickup outbox, a private worker endpoint, live permission rechecks and provider-confirmed invalid-token handling. No sender is active in production.
- **Native build:** The Android debug Gradle compilation workflow ran from the verified lockfile. The build is not complete until a successful APK artifact is present. The workflow is now manual to prevent every PR update from launching another expensive compilation.
- **Production state:** The mobile authentication, FCM device registration and transactional outbox tables have NOT been applied to production; no FCM credentials or push dispatch flags enabled. No verified/signed Play-release APK or on-device tests.


An Android-only customer companion app (React Native / Expo SDK 57) in the existing KONTA MOY repository. Work-in-progress source code; **not yet built, signed, submitted to Play or deployed to real customers**. This folder stays outside the root npm workspaces to protect existing web production deployment and lockfile until native dependency integration is validated.

## Current implementation (2026-10-16)

- Android identity: **KONTA MOY Companion**, package `site.kontamou.companion`; Expo platforms `["android"]`, no iOS target.
- Greek-language native home, nearby, account, pickups, offline shopping list and offline wishlist screens.
- SQLite lists on the device, with add, check-off, delete, per-item quantity and persistent state.
- Separate opt-in preferences for customer-requested list reminders and vendor promotions; **both disabled by default**. Vendor promo toggle stores preference only; no vendor promotional messages are sent from this release.
- Android native **local** shopping reminders: while app is foregrounded, if customer explicitly enabled reminders, granted foreground location and notifications, and an eligible nearby store stocks an item relevant to an unfinished list entry.
- On-device Greek token normalization, candidate matching and per-day notification cooldown. One item/vendor reminder per 24h; max two reminders/device/24h.
- `POST /api/mobile/companion/nearby-stock` on existing Next.js API: ephemeral foreground location used for a PostGIS nearest-shop query, only **verified active shops**, **approved local pickup offers**, actual positive inventory with `fresh` stock, live active products with Greek titles. It receives neither wishlists nor shopping-list contents. Uses small response cap, rate limit and never returns customer coordinates.
- Existing account/orders/QR pickups remain securely within the marketplace website as **temporary external browser handoffs**, not a fake native account or generated pickup token.

## Installation & QA

The pinned `mobile/package-lock.json` has now been committed and verified in GitHub CI. Use a reproducible clean install on networked Android developer machines:

```bash
cd mobile
npm ci
npx expo install --check
npm run check
npm run test:matching
npx expo-doctor
npx expo run:android
```

The Android CI uses `npm ci` and exports a production-format Android JS bundle. The debug APK still requires full native Gradle acceptance and physical-device verification. An independent GitHub workflow runs no-dependency matcher/GPS unit tests now. Real Android GPS, notification permission, app lifecycle and battery optimization behavior must be tested on physical devices.

## Critical boundaries

**A locally scheduled notification is not a remote push.** This version shows reminder notifications only when the app is open and a verified item match occurs. A backgrounded or force-closed app will not reliably trigger a geofence or notification. No background location permission or task has been added.

**Vendor promotional pushes are not implemented.** They require secure mobile login, a device-scoped FCM registration backend, independent marketing consent, live vendor campaigns and eligibility/rate controls. No vendor receives personal location or account data. Do not turn on promotional push on the strength of the local preference alone.

**Existing lists are not synced.** The current Android offline wishlist is separate from the website's saved products. Sync requires first-party mobile identity and API authorization before it can safely use the current database's `saved_products` table.

**Pickup QR is still a web handoff.** Do not generate, cache or expose live QR/pickup codes without authenticated order ownership and short-lived QR-token verification.

**Verified GPS eligibility currently blocks live matches.** Production checks found zero active vendor locations with both official verification and valid coordinates. Add coordinates through the governed vendor location workflow, not guessing from addresses.

## Mobile API contract

`POST https://kontamou.site/api/mobile/companion/nearby-stock`
request body: `{"latitude":37.07,"longitude":22.43,"accuracy":45}`
response: `{ "verifiedOnly": true, "products": [{ "vendorId": "...", "vendorName": "...", "vendorLocationId": "...", "vendorLocality": "...", "productTitle": "...", "variantId": "...", "distanceM": 160, "productUrl": "https://kontamou.site/shop?q=..." }] }`.

For privacy and authorization, neither customer IDs nor personal list contents are accepted by this endpoint. It does not return campaign-exclusive promotions. Nearby radius hard cap is 500m and accepted GPS uncertainty <=200m. Client matches words/variant IDs and gives a **possible match** notification, with a link to reconfirm live product details before visiting.

## Android build recovery — 16 October 2026

The 08:39 UTC Companion Logic and standalone Preview APK runs failed before packaging because `mobile/src/lib/nearby-matching.ts` mistakenly contained literal `\\n` sequences in a line comment. This commented out the exact-variant matching conditional and produced `TS1128` / Metro `'return' outside of function`. The module was corrected at source in the Companion draft branch; matcher behavior remains exact-variant-only for saved catalog products. Nearby matching tests pass in CI; this does not replace the full Expo / Gradle CI run, which must finish on the corrected branch before distributing a new APK.

## Companion vs PosoKanei boundary — 16 October 2026

**KONTA MOY Companion** is the native Android customer companion for the *KONTA MOY marketplace*: real canonical product variants, seller listings, offline per-device wishlists for verified nearby vendor reminders, account orders, local pickups and privacy-controlled notifications. **KONTA MOY × PosoKanei** is an independent supermarket price comparison and optimized multi-supermarket grocery basket tool. The generic bulk grocery-note parser/UI mistakenly placed in Companion was removed. Grocery equivalents, cheapest-brand suggestions, supermarket price splitting and any PosoKanei calculations must remain in the independent PosoKanei feature and are not Android Companion list logic.

## Native pickup status — 16 October 2026

The Android pickup screen now reads the customer's real `GET /api/mobile/companion/account` snapshot **only when authenticated Companion login is enabled**, displays real pickup orders and the `pickupReady` boolean, prioritizes ready-for-collection orders, and provides a validated first-party Custom Tab per order. All QR material remains exclusively on the existing protected website order page; there is no Android QR generation, server mutation, cached customer order record or implied live pickup when disabled. The Preview remains browser-only until production PKCE and its migrations pass the real-device gate.

Tests: `mobile/test/pickup-model.test.ts`, `mobile/test/marketplace-links.test.ts`. Validate signed-in and signed-out presentation, revoked sessions, pending/ready/cancelled/refunded orders and Android Custom Tabs on a physical device.

## Shopping-list usability increment — 16 October 2026

The Android catalogue search now lets shoppers explicitly add the **exact canonical variant** to either the offline shopping list or offline wishlist. Shopping-list repeats increment quantity instead of silently making duplicate rows (up to 99); wishlist repeats are idempotent and can reopen a completed saved item. Moving a canonical product between lists safely merges its quantity with an existing destination entry, retaining unfinished intent. Generic free-text notes remain independent and private.

The lists screen can hide completed entries and delete checked entries after confirmation. None of these actions modifies the server-side account wishlist, cart, stock or order ledger. The local SQLite database file and schema are unchanged; previously installed local data remains in place when the **same signing identity** is used. Preview remains a separate package ID to avoid breaking the original Android installation.

Logic regression tests: `mobile/test/list-rules.test.ts`, included in `npm run test:matching` and the Companion Android Logic Acceptance workflow. Still verify on-device add → repeat/add → cross-list move → tick → filter → cleanup → restart.

## Next release milestones

1. Mobile customer OAuth/PKCE or reviewed first-party token exchange; Android secure token storage, short-lived access + refresh rotation/revocation, logout; authorization contract with existing account.
2. Secure native account, order status, QR pickups and synchronized saved-products/wishlists/shopping lists. **No anonymous access to user orders/QR.**
3. Truly native marketplace product and cart browsing, delegated checkout with invariant-preserving existing commerce backend.
4. Opt-in FCM delivery tokens with user ownership, server-side suppression/consent and device unregistration; push for order updates and followed items even when Companion is backgrounded.
5. Vendor-targeted nearby offers (see draft PR #1551), separate explicit consent; must never expose user location to vendors; verify campaigns and limits.
6. Physical Sparta device pilot, production accurate vendor coordinates, test push, stock validity, pickup QR and privacy deletion.
7. Google Play location use declaration review. Google Play rejects background location used *solely* for ads. Assess any user-initiated shopping companion background use on its own merits. A limited active shopping trip using a user-started foreground service is a possible separately reviewed option, **not implemented** and not guaranteed to be accepted. Android can kill location/geofence execution when the app is terminated.

Official docs: https://docs.expo.dev/versions/v57.0.0/sdk/location/ and https://support.google.com/googleplay/android-developer/answer/9799150.

## Android customer identity bridge (added in PR #1553)

The source now contains a guarded first-party Android authorization flow using **authorization code + S256 PKCE**. The browser uses an existing authenticated customer session to request explicit approval. A 2-minute single-use code returns to the registered Android scheme; only a client holding the matching PKCE verifier can exchange it. The mobile app holds its access token in RAM and its rotating refresh token in Android Keystore-backed `expo-secure-store`.

**Protected API endpoints:**
- `GET /account/companion-connect`: explicit customer approval in the secure marketplace browser; never accepts arbitrary redirect URIs.
- `POST /api/mobile/companion/auth/authorize`: browser session + CSRF + same-origin approval, issues a short-lived authorization code.
- `POST /api/mobile/companion/auth/token`: one-use code exchange and serialized refresh-token rotation. Replay of a previous refresh revokes its session.
- `DELETE /api/mobile/companion/auth/token`: revoke an Android session on logout.
- `GET /api/mobile/companion/account`: authenticated read of **only this user's** orders, pickup-ready status and existing saved products, with no pickup QR secrets or password hashes.
- `/account/companion-sessions`: website security page to review and remotely revoke each Android device's session.

Tokens are random 256-bit values; only their SHA-256 hashes are stored in the backend. Access tokens expire in 15 minutes, refresh validity rolls for up to 30 days with an absolute 90-day ceiling, and user status is checked on reads. No mobile session is created until a user actively approves it.

**Deployment gate:** all protected routes are off unless production explicitly sets `COMPANION_ANDROID_AUTH_ENABLED=true`. Only enable after migration `20261016074500_companion_android_sessions.sql` is applied through the governed schema pipeline and GitHub native/backend security checks pass. The migration enables RLS, revokes direct public Data API access and adds expiry cleanup. The app must **not** hold a DB connection string, service-role key, browser cookie or reusable pickup QR.

## Validation status

The Android offline matcher and PKCE vector CI passes. Dedicated Android SDK 57 dependency installation and TypeScript CI is being resolved; a physical Android app build and live OAuth redirect test remain required. A web preview cannot prove Chrome Custom Tabs redirect behavior or Android Keystore storage. Do not publish the app until the complete login/refresh/logout, account ownership, token replay and permission-revocation flow is tested on physical Android devices.

## Android native order history — 16 October 2026

A dedicated `/orders` screen now reads up to 25 recent authenticated marketplace orders when first-party mobile login is activated, with manual refresh, return-to-screen refresh, and filters for all, ready pickup, pickup, delivery and closed orders. It uses only the existing customer-owned account snapshot and validated first-party Custom Tab links. No QR, payment data, order history or location is persisted locally. A cancelled/refunded/returned/failed order, or a non-pickup order, can never be labelled ready by an inconsistent `pickupReady` flag. The account screen uses the same shared status model and protects against older in-flight account responses overwriting a logout/refresh. Preview still has the safe browser fallback; activation, full Android build and real-user testing remain separate release gates.

## Native shared cart milestone — 16 October 2026

The Android draft now includes a first-party **account-owned cart** instead of browser-only cart navigation, but is **not yet a fully native checkout**:

- **Mobile API** `GET/PUT /api/mobile/companion/cart` uses the already-reviewed Android bearer session and the marketplace's existing Postgres `customerCommerce.customerCart` / `syncCustomerCart` functions. It never creates orders, reserves stock, stores payment secrets or trusts device-supplied prices. Canonical variant IDs, quantities (1–99), item limits, user ownership and duplicate submissions are validated. The API is independently gated behind `COMPANION_ANDROID_CART_ENABLED=true` **and** `COMPANION_ANDROID_AUTH_ENABLED=true`; both must remain OFF until migrations and device testing are approved.
- **Native buyer UX**: catalogue search can add the exact selected variant to the shared cart, and the basket shows customer cart contents with quantity +/−, removal confirmation, stock warning and indicative subtotal. The offline shopping list / wishlist remain separate.
- **Conflict protection**: each edit carries the last authenticated cart revision and persisted timestamp. The underlying commerce transaction locks the cart row and checks the last version before applying a replacement. Concurrent browser edits can otherwise lead to silent data loss. If stale, the Android app rereads the cart and asks the customer to retry. Empty carts before first persistence use a stable revision.
- **Checkout handoff**: the app opens the **existing official HTTPS checkout** in Chrome Custom Tabs. The customer must authenticate there as the same account if browser cookies are missing. That checkout alone revalidates fulfilment, vendor stock, address ownership, prices, shipping and Mollie payment. Browser-local anonymous cart entries might merge with account-cart data; confirm line items before paying.
- **Pricing semantics**: cart prices and availability are snapshot estimates only; flash sale and supplier pricing, pickup/delivery eligibility and shipping may change. No total or checkout eligibility is guaranteed until server checkout verifies.
- **Unreleased**: native address editing, shipping/locker selection, native payment UI, conflict-proof mixed browser-local cart merge, live auth/FCM tests, APK rebuild and production activation. Neither a passed JavaScript export nor a debug APK alone proves an actual purchase can complete.

Regression tests cover revision changes (including the unsaved-cart sentinel), guarded cart inputs, exact canonical items, bounds and client mutations. The Android CI checks matching, security tests, pinned Expo dependencies, TypeScript and JS bundle. Production web and Android physical-device checkout tests are still required before enabling the flags.

## Android account address-book increment — 16 October 2026

The existing KONTA MOY account address service now has a gated Android Companion bridge, plus a fully native Greek-language **saved addresses** screen linked from Account and Basket.

- `GET /api/mobile/companion/addresses`: reads only the authenticated customer's address-book profile through the existing `PostgresCustomerAddressService.profile`; no private cookies, location or other customers' records are accepted.
- `POST /api/mobile/companion/addresses`: **create only** (no edit/delete) through `PostgresCustomerAddressService.upsert` for the mobile bearer owner, with a size bound, strict field allowlist, full-name check, five-digit Greek postcode, optional phone validation, an explicit country restriction to GR and a customer-scoped rate limiter of at most five attempts/minute. The service also updates the account profile name, consistent with web address creation.
- Independent production gate: `COMPANION_ANDROID_ADDRESSES_ENABLED=true` AND already-deployed `COMPANION_ANDROID_AUTH_ENABLED=true`. Remain **OFF** until security review and on-device PKCE tests complete. Missing or revoked bearer is denied. No new schema or credentials on the phone.
- The native Android address screen displays saved billing/delivery defaults and can explicitly create a new address. It does not persist customer address details in SQLite, logs, marketing/location payloads or preferences. An active app session still retains screen state temporarily in memory.
- Existing-address editing, deletion and the actual checkout fulfilment choices remain with the first-party secure website. The same saved addresses are available to the existing authoritative web checkout; native selections are not silently forwarded or assumed to be chosen.
- Node tests cover invalid ownership/body fields, unsupported countries, required full name and postcode, embedded control characters and the native form. The mobile build/SDK export CI and physical-device lifecycle testing are separate release gates.

**Important checkout caveat:** Adding addresses does not make payments native. The browser must be signed into the same account, and the buyer must review the actual final cart, price, address, fulfilment, shipping/locker and Mollie payment before confirming. No production flags or databases are changed by this draft PR.

## Address management hardening — 16 October 2026

Companion now supports authenticated **view, create, edit and delete** of the customer's own saved Greek addresses in its native Android account screen. The backend routes still require both `COMPANION_ANDROID_AUTH_ENABLED=true` and the independent `COMPANION_ANDROID_ADDRESSES_ENABLED=true` flag; neither has been activated in production.

- Editing sends a complete validated address record and opaque address public ID. The existing Postgres address service updates only a row matching **both user and address**, fails instead of creating a new address for a missing/foreign ID, and uses the existing account transaction. Company name, VAT, phone and billing/delivery defaults are preserved in native edit forms rather than silently erased.
- Deletion requires an explicit Android confirmation and passes only the address ID. The existing database service changes only the signed-in user's address book, adjusts replacement defaults and leaves past order address snapshots untouched. If the last address is deleted, the buyer must create another to check out.
- A separate mutation rate limit applies to edit/delete. A rejected or revoked mobile bearer cannot access either action. Validation rejects extra identity fields, malformed IDs, unsupported country codes, invalid Greek postcodes, overlong fields and controls.
- Android dismisses previous address snapshots while a fresh customer account read is in progress; common API transport rejects late responses after logout/account switch. No address is saved to local SQLite or sent through notifications.
- Tests now cover update/delete input contracts, preservation of corporate invoicing fields and native edit round-trips. This is a **draft implementation** only: an APK, actual authenticated physical-device test, production schema/flag review, and full marketplace production CI are still independent release gates.

The final purchase flow, payment authorization, BOX NOW locker choice, shipping price and availability remain **exclusively** in the official checkout. Address changes here do not retrospectively mutate existing orders.

## White logo-assembly startup screen — Android

The Companion startup screen is a functional, **cold-start-only** React Native animation backed by `expo-splash-screen` and the existing official `mobile/assets/icon.png`. It is **not** a pre-rendered video and requires no additional native or third-party animation dependencies.

- The Android-native splash now uses solid `#FFFFFF`. React calls `SplashScreen.preventAutoHideAsync()` at module load, overlays the real animated white startup screen, then hides the native splash after the root layout mounts. This prevents a white-to-cream flash while the JavaScript app becomes interactive.
- `CompanionBootSplash` clips a single original logo image into a 3×3 grid of independent transparent-looking pieces. Pieces fly in from all four sides using native-driver transforms, then crossfade to the exact, unsliced original image at the center. The overlay fades away after a brief logo hold (~2 seconds total); navigation and account state remain mounted behind it.
- The animation plays once per process launch, **not** each route visit. If Android has **Reduce motion** enabled, the complete static logo appears briefly and fades without motion. Animation callbacks and timers are cancelled during unmount; no login or API response is needed to finish the splash.
- All imagery remains bundled with the Android APK; booting needs no network, notifications, location permission or authenticated session. It never delays application initialization beyond the short branding effect.
- `mobile/test/boot-animation.test.mjs` verifies that the official bundled logo is used, native and JS splash backgrounds are pure white, route mounting is gated correctly, and reduced-motion and cleanup behavior remain present.

**Release note:** The code runs in the development branch until a new Preview APK is compiled and tested on a physical Android phone. Native system splash screens are static until JavaScript starts; the movement begins immediately after the first React layout is mounted. Production, previous APK installs and marketplace backend are unaffected.

## Native KONTA MOY Color Finder Studios (October 2026)

The Companion now provides native entry points for all nine existing marketplace Color Studios, sharing the exact category codes and initial shades already used by `/color-finder`: Nail, Lip, Eye, Makeup, Hair, Shoe, Accessory (bags), Fashion and Home. The dedicated Studio District is accessible from Home and Services, with a native shade laboratory for each category.

**In the app:** 13 named swatches, exact `#RRGGBB` input, HSV hue/saturation/value fine tuning, a large selected-color board, and ranked real-color product cards. Results show shade labels, color precision (exact, canonicalized, or family estimate), indicative catalogue prices and product images when present. Customers can copy a matched canonical variant to the offline wishlist, add to the authenticated cart when enabled, or open the verified product in first-party HTTPS Custom Tabs.

**Data:** a separate read-only `/api/mobile/companion/color-studios` adapter calls the governed existing `getColorFinderProducts` (CIE `ΔE2000` similarity) to retrieve only products for the selected approved studio category and exact six-digit HEX. It limits the public response to 24 distinct color-evidenced canonical products; it does not infer nonexistent availability or invent shades or price savings. Results may legitimately be empty, and no claim of current store stock is made.

**Photo workflow:** tap “Πάρε χρώμα από φωτογραφία” to open the actual existing `/color-finder?category=...&color=...` photo sampler on the first-party website. It retains the website's pixel/area sampling and local-photo TTL/privacy protections. The Android app does not upload, cache or process personal photos; *native Android photo sampling is still outstanding* and must not be represented as shipped.

**UX boundaries:** Color Studios use a swatch wall and ordered rectangular product cards, **not** the spherical 3D universe (reserved exclusively for Sport & Fit Studio). There is no automatic saving of a customer's selected colors on the server and no commerce ledger duplication.

**Acceptance/release:** `mobile/test/color-studios.test.ts` checks the nine studio routes, HEX sanitation and HSV calculations; the standard Companion Android CI runs these plus catalogue/PKCE/permission/navigation checks, SDK 57 compatibility, strict TypeScript and JS export. A new Preview APK and physical device visual/testing remain independent gates before merging PR #1553 or releasing to users.

## Sport & Fit Studio — Android guided consultation, 18 October 2026

The Companion gains its own fullscreen `/sport-fit` entry from Home and Services rather than a link to generic sneaker search. It shares the **actual existing Sport & Fit engine** (`POST /api/sport-fit/candidates`) and does not invent a second compatibility database or ignore hard exclusions.

- The app asks **one question at a time**: sport (all eleven activities exposed by the current web engine: running, walking, gym, football, hiking, basketball, tennis, padel, volleyball, handball and badminton); adult/kid audience; optional EU shoe size and measured foot length; activity-specific surface; use case or gym training mode; frequency; where applicable distance and runner need; width/fit; priority; and optional budget. Invalid or inapplicable surface/use-case values never reach the API. Inputs remain in volatile component state only.
- On submission, the app passes checked, constrained answers to KONTA MOY's existing **catalogue + technical requirements + live-size guide** evaluation. Only the existing endpoint decides hard eligibility, ranking, accepted size and evidence. The native client validates returned product identities, prices and proof fields, and surfaces the recommendation evidence mode and technical coverage instead of claiming fabricated certainty.
- The results screen features an interactive **animated circular product universe** (not true native 3D/WebGL), with up to eleven circular product images visible at once. Selecting an orb opens a detail card with suitability evidence, technical fit/coverage, matching size if known and vendor price snapshot. Ranked compatible products, any additional equipment kit and server-provided EU size guide are preserved.
- The existing full **WebGL Sport & Fit universe** is available through the first-party `/sport-fit-studio` Custom Tab. The actual selected product opens its verified official detail, where exact size/variant, fresh stock and safe checkout must be rechecked. We intentionally **do not add a shoe to the cart without a confirmed size variant**.
- Current server endpoint is scoped to its configured participating vendor (default Kerasiotis) and qualifying products; this is **not a claim of nationwide, all-vendor inventory completeness**. The snapshot may change before purchase and unknown technical facts remain unknown. Empty survivor states are honest, not replaced by synthetic recommendations.
- No extra Android permissions, background location, camera or API credentials; no new app packages. Activity, size and backend input tests run in `mobile/test/sport-fit-questions.test.ts` alongside strict Android TypeScript, Expo SDK 57 and JavaScript bundle acceptance checks.
- This is a **draft branch implementation**. A fresh Preview APK, actual phone test, backend production-readiness review and full production CI remain release gates. The user's installed Android app and live marketplace are unchanged.

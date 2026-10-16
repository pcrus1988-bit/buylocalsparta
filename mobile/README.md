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

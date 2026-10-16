# KONTA MOY Companion — Android

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

The native package-lock has not yet been generated because this environment does not have access to the npm registry. The Expo docs were checked for recommended SDK 57 package versions; run on a networked developer environment:

```bash
cd mobile
npm install
npx expo install --check
npm run check
npm run test:matching
npx expo-doctor
npx expo run:android
```

Commit the generated `mobile/package-lock.json` and use `npm ci` for reproducible Android CI afterwards. An independent GitHub workflow runs no-dependency matcher/GPS unit tests now. Real Android GPS, notification permission, app lifecycle and battery optimization behavior must be tested on physical devices.

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

## Next release milestones

1. Mobile customer OAuth/PKCE or reviewed first-party token exchange; Android secure token storage, short-lived access + refresh rotation/revocation, logout; authorization contract with existing account.
2. Secure native account, order status, QR pickups and synchronized saved-products/wishlists/shopping lists. **No anonymous access to user orders/QR.**
3. Truly native marketplace product and cart browsing, delegated checkout with invariant-preserving existing commerce backend.
4. Opt-in FCM delivery tokens with user ownership, server-side suppression/consent and device unregistration; push for order updates and followed items even when Companion is backgrounded.
5. Vendor-targeted nearby offers (see draft PR #1551), separate explicit consent; must never expose user location to vendors; verify campaigns and limits.
6. Physical Sparta device pilot, production accurate vendor coordinates, test push, stock validity, pickup QR and privacy deletion.
7. Google Play location use declaration review. Google Play rejects background location used *solely* for ads. Assess any user-initiated shopping companion background use on its own merits. A limited active shopping trip using a user-started foreground service is a possible separately reviewed option, **not implemented** and not guaranteed to be accepted. Android can kill location/geofence execution when the app is terminated.

Official docs: https://docs.expo.dev/versions/v57.0.0/sdk/location/ and https://support.google.com/googleplay/android-developer/answer/9799150.

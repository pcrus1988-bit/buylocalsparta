# KONTA MOY customer mobile (development foundation)

This is the initial independent **Expo SDK 57 / React Native** customer app workspace in the existing KONTA MOY repository. It is deliberately **not** a production mobile app, an app-store submission, a WebView wrapper, or a live backend client yet.

## Why under /mobile (not /apps/mobile)?

The existing root npm workspaces include `apps/*` and have an independent Node 24 Next.js/Supabase deployment graph and locked dependencies. Keeping this first Expo foundation in a separate `mobile/` directory avoids unexpectedly replacing or changing the production npm dependency graph. Once native dependencies and authentication have been integrated and tested, maintainers can decide whether to move it under `apps/` and update the root lockfile intentionally.

## Setup (local developer machine)

1. `cd mobile && npm install` (generates the missing lockfile; commit it before merge).
2. `npm run check` to run strict TypeScript checks.
3. `npx expo-doctor` and `npx expo install --check` to validate native package compatibility.
4. `npm start` and open a development build on a physical Android/iOS device.
5. Use Apple/Google developer accounts + EAS only after legal and security release gates.

The app opens the web shop and existing account in the system browser, not a privileged embedded WebView. This is transitional and must be replaced with authenticated native commerce screens. No marketplace credentials are requested or stored inside the app.

## Already implemented

- Brand-led Greek native customer home and navigation.
- Native foreground-only one-shot location permission and GPS accuracy check after an explicit user tap.
- Clear disabled-by-default/never-enabled background location. No service, path logging, tracking, campaign enrollment, location upload or proximity notifications.
- Existing marketplace commerce paths open securely in external browser.

## Mandatory before release

- Native sign-in via authorization code + PKCE or equivalently reviewed first-party token exchange. Never move web session cookies, passwords, CSRF secrets, service-role keys or admin API keys into the client. Store refresh secrets in OS keychain/keystore; rotate and revoke server-side.
- Mobile read APIs for active verified shops, nearby campaigns, saved searches, notifications and orders. Reuse canonical vendor/product/stock entities and existing policy/authorization; do not create another inventory, vendor or checkout database.
- Build actual native catalogue, offer cards, cart, checkout handoff, orders and user preferences; launching with only external links will not meet App Store's utility requirements.
- Push registration for consented **non-location** saved-vendor, wishlist, stock and order alerts via APNs/FCM; store per-device tokens securely, remove at logout/revocation, enforce global cooldown/suppressions.
- Native proximity matching while visible with app user's separate opt-in. Do not import the browser CSRF/cookie-based account endpoint as an unauthenticated mobile API.
- Verify shop coordinates for current active vendor locations; they are currently missing.
- Run privacy impact and ePrivacy/marketing consent review. Display explicit location and notification controls with easy withdrawal; no data sharing with vendors.
- Apple/Google store account setup, owned bundle identifiers, final official logo/icon assets, screenshots, privacy policy and store descriptions.
- Native QA on real iOS/Android phones; ensure device permissions and declined permissions do not affect ordinary shopping.

## Background location: hard gate

Google Play background location permission is restricted to core, strongly justified functions. **Background location used solely for advertising or promotional offers is not an acceptable default** and is at serious risk of rejection; do not add `ACCESS_BACKGROUND_LOCATION` or enable `expo-location` background mode for this feature. A mobile app enables OS geofencing technically but it is not automatically a permissible production use.

Even where geofencing is allowed, iOS manages max ~20 monitored regions per app and Android ~100. Event delivery is delayed/approximate, Android app force-termination behavior varies, and platform policy/OS limitations apply. Never promise an exact instant alert while closed.

Recommended closed-app alternative for v1: opted-in **remote push** alerts for a customer's manually followed stores, saved products and requested alerts, which do not require tracking location in the background. For nearby exclusive offers, query location only while the app is visibly in use and granted temporary foreground permission.

See `docs/KONTA_MOY_MOBILE_APP_DECISION_20261016.md` for architectural rollout.

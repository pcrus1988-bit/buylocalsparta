# KONTA MOY customer mobile — native-first decision (16 October 2026)

## Decision

Build one customer-facing iOS/Android app using React Native + Expo SDK 57 and Expo Router. Keep the existing Next.js website, checkout, vendor and admin portals as the source of truth; connect through a secure mobile API boundary. **No new marketplace, stock database or duplicate vendor catalogue.** Stage 0 native app foundation in `mobile/`; no production activation.

The prior opted-in foreground web implementation is in draft PR #1551. Treat it as a **backend domain/API exploration**, not as a production-grade native mobile API. It currently relies on authenticated web cookies/CSRF and is not to be called from native without a designed mobile authentication contract.

## User experience

- Home: local discovery, recommended nearby merchants/products, search.
- Nearby: map/list of **verified** shops and truly additional exclusive offers; user chooses one-time/while-in-use location.
- Shop: canonical product family → variants → seller offers → basket → checkout/QR pickup.
- Account: existing identity, orders, wishlist, return progress and contact support.
- Notifications: opted-in saved-store alerts, wishlist price/stock alerts, order status, near-me content **only while using the app** in initial release.
- Vendor/admin stay on the web app; do not bundle vendor permissions in the customer client.

## Core technical boundaries

| Concern | Choice |
| --- | --- |
| Mobile frontend | React Native / Expo SDK 57, TypeScript, native screens |
| Identity | First-party OIDC/OAuth PKCE or audited mobile token exchange against existing customer auth; server-side rotating refresh and revocation |
| Authorization | Backend token scopes, vendor isolation & account ownership, no service-role secrets on device |
| Catalogue / checkout | Reuse existing KONTA MOY services, product variant IDs, stock and checkout business rules |
| Store geodata | Approved vendor location coordinates only; verify manually and handle missing/inaccurate GPS |
| Foreground location | One-shot Android/iOS foreground permission on user action; no GPS history in backend |
| Push | APNs/FCM tokens, separately opt-in; not a surrogate for background GPS |
| Native alert tap | Deep-link to exact campaign/vendor/product; confirm campaign expiry, stock and user eligibility before redemption |
| Analytics | Aggregate redemption/conversion without maintaining customer routes or exact coordinates |
| Native build | Expo Development Build + EAS, real-device testing, official branding and store policies |

## Release sequence and acceptance criteria

1. **Native foundation:** branded navigation and simple foreground location, no backend dependency. Complete once device build and typecheck verified (this PR adds sources; build/test still pending).
2. **Mobile identity:** end-to-end login, token rotation, logout, revocation, device/keychain tests and audit.
3. **Read-native discovery:** verified shops and canonical offers + map/list, offline and poor-GPS fallbacks.
4. **Commerce:** cart checkout handoff/complete flow, order status, QR pickup, wishlist; no split-brain pricing or stock.
5. **Notifications:** platform push, device consent, suppressions, replay/dedupe and fine-grained user preferences.
6. **Proximity pilot:** ONLY foreground GPS-triggered nearby discounts, reserved to verified active vendors with accurate coordinates and a real extra benefit; cap alerts, protect consent, stop immediately on opt-out.
7. **Closed-app geofence research:** separately assess iOS/Android platform policy, purpose limitation and approval. Do not ship Android background location just for promotional offers. Reject unsupported behavior rather than misleading app users.
8. **Sparta beta and publishing:** live device trials, legal review, release readiness, app store ownership, app privacy declarations.

## Important policy and OS constraints (checked October 2026)

- Google Play's Background Location policy: advertising/promotional-only use of background location is not acceptable, and qualifying features require strong core benefit; background ads-only requests are denied: https://support.google.com/googleplay/android-developer/answer/9799150
- Apple Core Location geofencing: 20 simultaneous monitored regions max, OS events not instantaneous: https://developer.apple.com/documentation/CoreLocation/monitoring-the-user-s-proximity-to-geographic-regions
- Expo Location: native background geofencing needs appropriate permissions & development builds; 20 iOS / 100 Android region limit; Android app termination can stop detection: https://docs.expo.dev/versions/latest/sdk/location/
- Apple's App Review Guidelines 4.2 require an actual useful app, not merely a website wrapper: https://developer.apple.com/app-store/review/guidelines/
- Location and notification consent are independent, separate from general marketing or analytics consent.

## Verified launch blocker

Earlier direct inspection of production project reported two currently active, publicly visible vendors whose verified physical locations **lack coordinates**. Do not invent or geocode these silently for campaign eligibility. Request manual verification before first real proximity pilot.

## Out of scope of Stage 0

No live auth, campaigns, backend location submission, remote push, persistent OS background location permission or app store publication has been completed. It is a source scaffold/architecture foundation only.

# KONTA MOY Companion — Android FCM release gate

As of 16 October 2026 this is development source in draft PR #1553, **not a live push service**.

## What is implemented

- Android native FCM registration with `expo-notifications.getDevicePushTokenAsync()` **after** signed-in user action and Android notification permission
- Push preferences for **order/pickup updates** and **customer-requested saved-product updates**, off by default and independently selectable
- Authenticated backend `GET/PUT/DELETE /api/mobile/companion/push/device` and read-only status (without revealing the device token)
- Opaque mobile bearer validated against active session + active customer and strict first-party push registration gate
- Device token **AES-256-GCM encryption at rest**; SHA-256 fingerprint for uniqueness; user/session ownership; per-action consent audit
- Zero vendor promotional push enrollment: `vendorOffers=false` enforced in request validation **and in the database**. Nearby vendor promotions must pass their own legal, consent, campaign and geofencing review
- Optional `POST /api/mobile/companion/push/test` self-test, at most once per device/24 hours, only after explicit additional flag
- Native token-rotation listener that refreshes an existing registration only, and safe first-party notification tap handling

**Important:** No automatic production order/wishlist notification event dispatcher exists yet. The self-test only verifies submission to FCM, not receipt. No customer registration or message has been executed. No Android background location permission was added.

## Activation prerequisites — DO NOT SKIP

1. Apply **only through governed migration rollout**:
   - `20261016074500_companion_android_sessions.sql`
   - `20261016083000_companion_android_push_devices.sql`
   Verify RLS and that `anon` / `authenticated` roles have no grants. The second migration requires the first.
2. Secure and verify the first-party Android PKCE flow, signed Android APK, redirects, logout and remote device revocation on a real Android device. Do not set `COMPANION_ANDROID_AUTH_ENABLED` beforehand.
3. Create a Firebase project for **`site.kontamou.companion`** and download Android **`google-services.json`**. Do not commit the service-account key. Inject the client configuration at build time via `COMPANION_GOOGLE_SERVICES_FILE=./google-services.json` (or EAS secret file reference). EAS application ID/package and Firebase Android app must match. Android 13+ permission test is mandatory.
4. Set the following **server-side-only** secrets and gates:
   - `COMPANION_FCM_TOKEN_ENCRYPTION_KEY`: 32 random bytes, encoded as Base64 (must back up and rotate deliberately)
   - `COMPANION_FCM_SERVICE_ACCOUNT_JSON`: Firebase service account JSON with least privilege / Firebase Messaging rights. Server only, never `EXPO_PUBLIC_`, never sent to the app or committed
   - `COMPANION_ANDROID_AUTH_ENABLED=true`: *after* migrated auth schema and mobile security QA
   - `COMPANION_ANDROID_PUSH_REGISTRATION_ENABLED=true`: *after* migrated push schema and encryption key
   - `COMPANION_ANDROID_PUSH_TEST_ENABLED=true`: optional separate **test-only** gate; keep false by default and turn off after QA
5. Run `cd mobile && npm ci && npm run check && npx expo install --check`, then build and install the signed Android development APK on a physical phone with the Firebase configuration.
6. Validate: refuse prompt before user action; deny Android notification permission; account logout; revoke session from web; token rotation; invalid token; two accounts on one device; lost/expired refresh token; offline opt-out; device-level sound preferences; push receipt while the app is backgrounded. Provider acceptance does not prove device receipt.
7. Only once device registry and explicit consents have been validated: design an event-driven dispatcher triggered by authentic order/pickup state changes and saved-product alerts. The dispatcher must check *current* active consent, session revocation and per-device rate limits on every send; dedupe events and handle FCM invalid-token responses. No vendor route may send arbitrary text to device tokens.

## Security and privacy

- Push registration endpoints do not collect or process location, personal shopping-list contents, or GPS history.
- Device tokens are personal identifiers: encrypted at rest and never logged, returned to a vendor or exposed to the browser.
- The push token is bound to an authenticated customer's **mobile session**, not a user ID from the request body.
- Unregistering writes a consent-revocation event; disabled devices are excluded from messages and cleaned by retention.
- Existing vendor exclusive offers remain isolated behind the separate campaign draft PR #1551; **customer location is never given to merchants**.
- Test sends only reach the authenticated customer's registered device, never arbitrary FCM tokens.
- Do not ship `ACCESS_BACKGROUND_LOCATION` for promotional advertising. Android-only shopping reminders still run only with foreground location until a compliant user-initiated core benefit is designed and reviewed.

## Official documentation

- Expo SDK 57 Notifications: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- Expo Android Firebase registration: https://docs.expo.dev/push-notifications/fcm-credentials/
- Direct FCM: https://docs.expo.dev/push-notifications/sending-notifications-custom/
- Firebase HTTP v1 send: https://firebase.google.com/docs/cloud-messaging/send/v1-api

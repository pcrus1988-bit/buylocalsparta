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

## Transactional notification outbox — added in this PR

Source:
- `supabase/migrations/20261016093000_companion_transactional_push_outbox.sql`
- `apps/web/src/lib/companion-push-dispatch.ts`
- `apps/web/src/lib/companion-fcm-status.ts`
- `POST /api/internal/companion/push/dispatch`

*Why an outbox?* A real order status transition or an actually ready pickup must commit to the existing marketplace before the notification is considered. The outbox is appended inside the same PostgreSQL transaction as that state change. It does **not** accept vendor-authored messages. The pickup event is deduplicated by its pickup-group ID, avoiding two notifications if ready status and ready time are updated separately.

**Delivery validation:** only active account owners with a current Android mobile session and an enabled *order updates* consent get deliveries. At dispatch time ownership, consent, session revocation, token age, event expiry and pickup readiness are checked again. The server claims a maximum of **2 FCM requests per invocation**, with a 24-hour event TTL, three delivery attempts, four submitted order alerts per device/day, a short lease, and conservative backoff. Firebase transient failures do not unregister a device. Only a provider-confirmed invalid FCM registration can disable it. The message includes no name, store, price, QR, personal list, exact location or merchant-controlled text.

**Strict feature gate (disabled by default):**
`COMPANION_ANDROID_PUSH_DISPATCH_ENABLED=true` *and* `COMPANION_PUSH_DISPATCH_SECRET` (>=32 characters), in addition to all previous auth, registration, migration, Firebase and encryption prerequisites. The route requires `Authorization: Bearer <server-only secret>`, and accepts POST only. It has no Vercel cron schedule and no background worker connection; creating the route does **not** start sending. Do not schedule it until signed-device, opt-in, cancellation, revoke and duplicate-prevention tests pass.

**Explicit known boundaries:** self-test can verify FCM submission, but not Android receipt. A failed worker may retry after a claim lease expires, so repeated alerts are possible under rare crash timing, though FCM Android collapse and notification tags reduce duplication. Saved-product stock-change event dispatch is **not** implemented in this outbox, despite saved-item token registration. True background geographic triggers are also not implemented, and vendor offer marketing remains strictly blocked. Both need separate eligibility and legal/policy acceptance.

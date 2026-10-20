# KONTA MOY — κοντινές αποκλειστικές προσφορές

## Scope shipped in this PR

- Customer setting: /account/nearby-offers (off by default).
- Separate explicit permissions: server-side nearby-offer consent, browser location permission, browser notification permission.
- Vendor campaigns: /vendor/settings/nearby-offers, limited to the existing `promotions.manage` capability.
- Only active, verified physical shops and active/visible vendors can publish and match.
- Approximate geofence radii 100–500m; campaign windows up to 30 days; start/end enforced at query time.
- Foreground web checks every 120 seconds while KONTA MOY remains open, visible and the browser previously granted geolocation; never prompt from background poll. Manual scan is user-initiated.
- At most 2 notifications per user per 24 hours, 1 per vendor per 24 hours, 1 per campaign per 7 days. Advisory transaction lock prevents races across devices.
- Browser notification where available; in-app discovery without notifications remains possible. Notification worker has narrow scope and does not implement a background geofence or an always-on location request.
- No raw location, movement trajectories or lat/lon in the database or vendor dashboard.
- The 30-day delivery-suppression ledger is purged by a nightly `pg_cron` job. Consent receipts stay separate for accountability.
- There is no automatic reduction of marketplace checkout prices. Optional coupon codes are in-store redemption instructions only.

## Critical platform limitation

Web Geolocation is only reliable while the page is running. Service Worker Web Push can display a remote event, but cannot itself detect that a closed browser/PWA crossed a geofence. iOS 16.4+ Home Screen web apps can receive Web Push when subscribed, but that **does not provide background location detection**. A true proximity alert with KONTA MOY completely closed needs a native iOS/Android component (Core Location region monitoring / Android GeofencingClient) and an OS-approved background location permission flow.

Future native rollout should:
1. Ask separately for background location, foreground location, local notifications and marketing opt-in; show a prominent off switch.
2. Download the nearest **verified** shop geofences (with campaign IDs/radii/expiry only) while authenticated, within OS limits. Never use 100,000 nationwide monitors on device.
3. Let the OS detect dwell/entry, then request the same backend eligibility/cooldown check for the offered campaign. Do not persist raw lat/lon or send the user's route.
4. Show a native local notification (or optional push for the validated event), and refresh geofences only when opted in and the OS permits.
5. Review iOS/Android background-location store policies and Greek/EU GDPR and ePrivacy direct-marketing consent before general release.

## Release gate and manual QA

1. Merge the schema migration through the standard production migration pipeline **before** deploying web code. The migration requires the `postgis` and `pg_cron` extensions (both were present on the inspected project).
2. Verify schema-head readiness and security advisors. Run main repository CI, production preview smoke tests and TypeScript typecheck.
3. Verify consent begins disabled and no geolocation is requested on first page load.
4. Enable discovery, deny location, ensure no location query is stored and no notification appears.
5. Grant location manually, then enable phone notifications in a **separate** tap. Walk into a verified vendor radius with an active campaign. Confirm a single foreground notification and an offer card, and confirm none after the daily cap.
6. Turn off either permission, repeat scan and ensure no notifications and no GPS polling after opt-out. Verify account/merchant isolation and both vendor authorization/CSRF paths.
7. Test iPhone (Safari tab and Add-to-Home-Screen separately), Android Chrome and desktop. Expect varying foreground notification support. Do **not** market closed-app background alerts as available.
8. Verify expired and paused campaigns are excluded and that inactive/unverified shops never appear.
9. Validate nightly removal of `nearby_offer_delivery_log` rows older than 30 days; ensure no geographic coordinates are logged by HTTP middleware/analytics.

## Practical product guardrails

- The primary offer must be a genuine additional benefit, with clear terms and expiration. Vendors cannot view recipients' coordinates or personal information.
- Use precise original shop coordinates only when manually verified. Imported registry locations remain ineligible until verification.
- Use unambiguous Greek consent copy. Withdrawal must not affect orders or other account features.
- Treat notification and location permissions as separate from cookie analytics and email marketing consent.

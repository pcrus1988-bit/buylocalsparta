# KONTA MOY Companion — Android-only development decision

Updated 16 October 2026 to reflect the specific product goal and platform choice.

## Product mandate

KONTA MOY Companion is a dedicated **Android customer companion** to the existing KONTA MOY marketplace, not a secondary storefront or vendor dashboard. It should connect saved shopping needs with nearby, verified local stock and proactively support the real-world journey: search → choose vendor → buy → local pickup QR → reminders and follow-up.

iOS is explicitly out of scope. The Android app name is `KONTA MOY Companion`, Android application ID `site.kontamou.companion`.

## Current implementation

See `mobile/README.md` and draft PR #1553. Native shopping/wishlist lists persist in SQLite. Foreground location discovery uses a bounded HTTPS marketplace endpoint, performs wishlist matching on-device, and uses opted-in on-device Android notifications. The customer can open existing account and pickup screens securely via system browser. Neither a native signed APK nor store publication nor native account/pickup sync is complete.

The separate web/Vendor Nearby Offers backend and campaign UI remain in draft PR #1551; that code does not create an Android mobile authentication contract, and must not be used to send unsolicited messages. No existing production location processing was enabled.

## Notification classes and trust boundaries

| Notification category | Whose request? | Eligibility rule | Current status |
| --- | --- | --- | --- |
| User shopping-list reminder | Customer explicitly added an item & opted into reminder | Verified physical shop, true pickup inventory, canonical match, <=500 m, foreground permission | Local Android notification coded; device QA pending |
| Wishlist price/stock change | Customer opted in to monitor specific canonical variant | Server evaluates only owned saved products and live stock | Pending mobile auth and FCM |
| Pickup/order | Transactional event on customer's own order | Authorized order/pickup token, idempotent delivery | Existing website; mobile FCM pending |
| Vendor exclusive nearby offer | Separate marketing opt-in | Approved vendor campaign, explicit audience eligibility, geo consent, time/stock and cooldown | Preference-only scaffold, no live mobile vendor push |
| Closed-app location-driven alert | Separate OS policy and consent review | Only if Google Play allows a truly core benefit, with foreground alternative | Not implemented; no Android background location permission |

## Non-negotiable security

- No merchant access to live customer GPS, personal shopping lists or identity from nearby discovery.
- No raw GPS coordinate retention in device history/database, HTTP analytics or notification payloads.
- Do not embed web login cookies, user password storage or Supabase service-role keys inside Android.
- Use reviewed first-party auth, secure local token storage, refresh-token rotation and logout revocation before syncing account/wishlist/orders.
- Never present a fabricated pickup QR, reserve stock or imply availability without real live inventory.
- Allow immediate opt-out of each marketing/reminder category; permission revocation must stop monitoring even if the application is in memory.
- The product must remain useful with location and notification permissions denied.
- Avoid background tracking for marketing: Google Play may reject background location requested solely for advertisements. Any user-started shopping trip foreground service is a **separate** future design requiring explicit review, an ongoing Android notification and real device tests, not a workaround to permission policy.

## Engineering milestones

1. Android-only signed development build; verify dependency pins & generated `mobile/package-lock.json`; build + unit test + real GPS and notification QA.
2. First-party Android PKCE-based sign in and server session bridge; secure token storage and authorized mobile APIs.
3. Merge offline lists with existing customer saved products and saved searches only after identity is secure; maintain variant-level match and user ownership.
4. Native order/QR pickup screens with dedicated one-time tokens, no personal data leaking to merchant until redemption.
5. FCM authenticated device registration, per-user consent and suppression (no token registration until signed in).
6. Merchant promotions from reviewed campaign source with correct marketing consent, no broad vendor push without verified consent and eligibility.
7. Validate physical store GPS for active vendors; currently zero active vendor locations satisfy approved GPS requirements.
8. Sparta closed beta then Play release review. Keep web marketplace and vendor admin untouched.

## Platform references

- Expo SDK 57 location: https://docs.expo.dev/versions/v57.0.0/sdk/location/
- Expo SDK 57 notifications: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- Google Play background location requirements: https://support.google.com/googleplay/android-developer/answer/9799150

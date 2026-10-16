# KONTA MOY Companion — Android internal-test installation

**Do not share with shoppers. This is an unsigned-for-Play, development/testing-only Android build.** The current production KONTA MOY backend has not enabled Companion login, FCM registration or push dispatch. The Android app's offline shopping list, wishlist, privacy deletion and foreground permission screens are testable without them.

## Recommended install package

Use the **standalone internal-test APK**, not the older `app-debug.apk`.
- Build workflow: `.github/workflows/companion-android-standalone-apk.yml` (pull request #1553).
- Check GitHub Actions for a *successful* workflow and its `kontamou-companion-android-preview-standalone` artifact.
- A release-mode test APK contains the bundled JavaScript (no Metro server required), but is signed only with the build's local debug key. It is **not** the final Play signing identity.
- If no successful artifact exists, stop: do not present a debug APK needing Metro as a standalone release.

## Android installation

1. Download the successful standalone-test artifact ZIP to an Android phone; extract the `.apk`.
2. Open the file, allow install from this trusted source for this installation, and confirm the package name `site.kontamou.companion.preview`. The Preview is installed beside the original app; its offline data is separate.
3. Open the app. Test offline lists and privacy reset with **all permissions denied first**; it should remain usable.
4. Opt into local reminders only if you intend to test foreground location and Android notifications. Location permission should be **while using the app**; background/always-location is not requested.
5. When walking near a store, Nearby results should be produced only for independently verified physical shop coordinates and fresh local-pickup stock. A blank list is expected until stores are validated.
6. Do not expect login, synced orders, QR pickup or FCM notifications from the production backend until the guarded Companion migrations and services are explicitly reviewed and deployed.

## QA acceptance checklist

- Android 13+ notification permission denied and granted: app never forces prompts on launch
- Location denied / approximate / precise: no crash or unexplained alert; location scan is user-initiated
- List: add a free-text item, set quantity, mark complete, reopen after force-stop, delete individual item
- Catalogue-to-list: search and add an exact canonical variant to the shopping list, add the same variant a second time (quantity +1), add to wishlist without duplicate, move between lists and confirm safe quantity merge
- Completed-item cleanup: hide/show checked entries, confirm bulk deletion, restart and verify unchecked entries were kept
- Bulk paste: choose shopping list and expand **Προσθήκη ολόκληρης λίστας**, enter `2x Γάλα` and `Γάλα`, verify one 3-item-count row, then try a 99+ overflow import and verify **none** of the batch was committed
- Restart offline and verify pasted notes remain local; no account, FCM, location or merchant data access is required
- Wishlist: add entry, switch tabs and verify separation, test local reset
- Offline: disable network; existing local list still works and account errors are non-destructive
- Background: lock phone or swipe away app; **no ongoing foreground location monitor remains**
- Android account: sign-in shows disabled message until reviewed mobile auth backend enabled
- Pickups: order QR is obtained only via existing authenticated marketplace page, not invented in the app
- Notifications: FCM device registration is gated; no vendor marketing push or arbitrary notifications
- Logout / remote revoke and Firebase token rotation after the production service is enabled, on a test customer only

## Build and trust

- Source: `mobile/` in draft PR #1553.
- Native production-intended package: `site.kontamou.companion`; separate Preview APK package: `site.kontamou.companion.preview`. Android only, version `0.2.0`.
- Pin packages by `mobile/package-lock.json`, use `npm ci`.
- Run `npm run check`, `npx expo install --check`, `npx expo export --platform android`; then native Gradle release-mode build.
- Developer-signed internal APK signatures are **not transferable to Play Store installations**. Before a Play release, configure EAS production credentials and separate production signing.
- Firebase `google-services.json` and FCM service-account JSON must be provided separately, outside Git, and only for approved device testing.
- Protect customer data: no test screenshots or bug logs should capture QR pickup tokens, credentials, phone numbers or notification device tokens.

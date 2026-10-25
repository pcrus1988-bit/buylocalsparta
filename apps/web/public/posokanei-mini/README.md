# ΚΟΝΤΑ ΜΟΥ × PosoKanei — Mini App

A very small, mobile-first, no-dependency web app / installable PWA. It is intentionally independent from the large original interface while using its existing **read-only, release-gated** APIs.

## What works

- Search verified, **published** products through `GET /api/posokanei?q=`; display prices **only** when the API says `status: ready`.
- Build a temporary shopping list of up to 20 product lines. Add manual/unpriced items even before price publication. The list survives in the **same browser tab** via `sessionStorage`; it is not account-level saving.
- Filter supermarket chains and select a cap of 1–5 supermarkets.
- Call existing authoritative optimizer with `POST /api/posokanei/optimize`; show grouped, checkable plan and price savings only for a **complete** priced basket.
- Review already verified cheaper-brand alternatives via `POST /api/posokanei/alternatives`; allow choosing only approved cheaper, quantity-equivalent alternatives.
- Copy shopping plan, install to Android home screen on supported browsers, and open cached app shell offline. **Prices are never cached by the service worker.**

## Integration

Copy the contents of this folder to `apps/web/public/posokanei-mini/` in the existing KONTA MOY Next.js repository, or host the folder at `/posokanei-mini/` on the **same origin** as the APIs.

Open `https://kontamou.site/posokanei-mini/index.html` **only after a release is merged and deployed**. This app must not bypass the three existing price-publication checks in `posokanei-public-runtime.ts`:

- `POSOKANEI_PUBLIC_RELEASE_ENABLED=true`
- `POSOKANEI_DATA_REUSE_APPROVED=true`
- approved, published HTTPS snapshot or government mirror configured as already supported

If these conditions are not met, the app still supports the manual list and explicitly states that no verified prices are published. Never replace with synthetic prices or screenshots.

Local static preview: `python3 -m http.server 8080` in this folder then visit `http://localhost:8080`. Search and optimization need a same-origin KONTA MOY backend; the local preview is for layout / manual list only. Do not publish this local server to end users.

For permanent saved lists, use the existing authenticated full service at `/posokanei` (the mini app links to it).

## Tests

Run `node --test tests.mjs`. Tests cover safe HTML, filtering, result grouping, availability / alternative rules. No production, payment, or database writes are performed.

Price source disclosure: Government-origin `posokanei.gov.gr`, independent presentation by ΚΟΝΤΑ ΜΟΥ; prices are historical/reference observations, not retailer availability or guaranteed checkout prices.

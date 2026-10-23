# Lidl GR: publish source-labelled weekly offers first, match later

## Status
This feature is **implemented as a rights-gated catalogue on /posokanei**.
It is not a product catalogue for all Lidl stock; Lidl's public offers feed lists
weekly advertised promotions. On 2026-10-23, the independent public feed
`GR0851` (Sparti) returned 57 promotion entries. Counts vary over time.

## Customer-facing workflow
- A new panel **Προϊόντα σε προσφορά Lidl** appears directly on /posokanei.
- Initially the selector references Lidl Sparta `GR0851`, sourced from the
  official Greece public store directory (234 stores checked on 2026-10-23).
- Shoppers may select another store, search, see current or upcoming advertised
  promotions, and inspect observed prices, strike-through reference amounts
  (not mislabelled as a proven past low), offer windows and source.
- Items have their own `lidl_gr:<store-key>:<offer-uuid>` source identity and are
  **unmatched**, **not basket-eligible**, not a vendor offer, and not a source
  GTIN. They appear without copying Lidl product images or logos.
- Never claim stock availability, national pricing, or that Lidl Plus
  membership is unnecessary. Ask buyers to verify conditions with Lidl.
- After obtaining SKU/barcode evidence, the later matching milestone can
  attach a confirmed Lidl promotional price to a PosoKanei product; matching
  remains a **separate pipeline**.

## Activation
Independently establish and document source database/commercial reuse rights.
The FaserF/ha-lidl MIT licence covers its code **not Lidl's data**.
Do not enable without review. The public route fails closed unless both
environment settings are true:

```env
POSOKANEI_LIDL_PUBLIC_LIST_ENABLED=true
POSOKANEI_LIDL_DATA_REUSE_APPROVED=true
```

Source is fixed to unauthenticated Greece endpoints:
- `https://stores.lidlplus.com/api/v4/GR`
- `https://offers.lidlplus.com/app/api/v4/GR/{verified_store_id}/offers`

No browser impersonation, login bypass, private coupons or account data.
The service accepts no outbound URL from customers, rejects invalid store
IDs, verifies IDs against the source directory, caps the response to 2 MB,
uses a 12-second timeout, rejects redirects, caches the directory 6 hours
and offers for 30 minutes within the process, and handles 403/429 by showing
source-unavailable instead of circumventing restrictions. If access fails
under ordinary Node fetch in the Vercel environment, do not deploy spoofing
or stealth scraping; seek a licensed provider data feed.

An offline fixture suite tests normalization, expiration, preview dates,
duplicates, zero prices, currency, loyalty uncertainty and source identity:
`node --test scripts/posokanei/lidl-standalone-feed.test.mjs`

Production release checklist: documented data reuse rights; clean TypeScript
build; live verified Vercel preview under the approved source rules; preview
accessibility; confirm independent section visible; source 403 errors
handled; confirm PosoKanei baseline catalogue and basket unaffected; then
promote a tested production build.

## Non-goals
No PosoKanei matching, no creation of marketplace products, no shopping-cart
inclusion, no capture of Lidl credentials, no product photography redistribution,
no claim that all Lidl supermarket products are included.

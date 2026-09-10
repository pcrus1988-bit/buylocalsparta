# KONTA MOY premium marketplace acceptance

Basis: `KONTA_MOY_UX_UI_Review_2026-09-09.pdf` plus the approved premium-marketplace direction developed after the review.

This checklist is an implementation gate for `feat/premium-marketplace-experience`; it is not a claim that production has already passed every item.

## P0 — public catalogue and content integrity

- [x] Public `/shop` results require an available product, positive public price, sellable quantity and eligible vendor.
- [x] Homepage discovery admits only genuinely purchasable cards and preserves the existing fair supplier-selection behavior.
- [x] Category product counts/results use purchasable catalogue data.
- [x] Featured headings no longer promise a fixed number of products.
- [x] Obvious placeholder/test and explicitly non-customer-ready merchant profile copy is suppressed at the public directory data boundary; governed story/category/product context becomes the fallback.

## P1 — mobile catalogue and global navigation

- [x] `/shop` uses a compact mobile Filter / Sort trigger instead of placing the full form before products.
- [x] Filter drawer has modal semantics, focus containment, Escape close, focus return and scroll lock.
- [x] Mobile filter trigger exposes the current result count.
- [x] Apply and clear-filter actions remain available in the existing server-rendered filter form.
- [x] Typical 360–430 px product grids remain two columns; only very narrow widths fall back to one column.
- [x] Mobile commerce labels are approximately 11 px rather than the former 8.2 px.
- [x] Mobile search input is 16 px and primary touch controls are at least 44 px.
- [x] The compressed desktop header is replaced by a controlled mobile/tablet menu.
- [ ] Complete visual acceptance at 320, 360, 390, 430, 768, 820, 1024, 1280, 1440 and 1920 px, including landscape and on-screen keyboard cases.

## P1 — product, cart and checkout decisions

- [x] Product page keeps price, selected variant, stock and add-to-cart action together.
- [x] Unavailable variants now have explicit visible `Μη διαθέσιμο` treatment, not only DOM semantics.
- [x] Real vendor/adviser context and Ask Local actions are shown when governed data is available.
- [x] Cart waits for presentation metadata instead of flashing incomplete letter placeholders.
- [x] Cart explains before checkout that account authentication is required by the current order/address/receipt flow and that cart state is preserved.
- [x] Checkout retains the three stages: details, fulfilment, payment.
- [x] Gift-card input is collapsed until needed.
- [ ] Surface resolved destination-aware delivery/pickup timing and cost earlier in product/cart once the underlying delivery-promise runtime is safely integrated.
- [ ] Show resolved eligible payment methods before external payment redirect when supported by the payment runtime.

## P2 — shared visual system and hub gateway

- [x] Deep green, warm off-white, white commerce surfaces and restrained brass form the shared premium palette.
- [x] Noto Sans provides a neutral Greek-capable UI/body face; editorial display moments use a more distinctive serif treatment.
- [x] Legacy pill-heavy public-header treatment is removed in the premium acceptance layer.
- [x] Homepage begins with locality/search and the concise `Μια ολόκληρη πόλη. Κοντά σου.` promise.
- [x] Real governed merchant photography is used when available; no fabricated merchant identity is presented as real.
- [x] `Βόλτα στην αγορά` uses real active vendors and keeps editorial exposure separate from transaction supplier assignment.
- [x] Editorial collections are live routes backed by purchasable products.
- [x] Location gateway uses customer-facing states `Αγορά διαθέσιμη`, `Ετοιμάζεται`, `Στο πλάνο` and no longer serializes internal research/prospect fields to the browser.
- [x] Locality is remembered and the shopping experience exposes a change-region path.
- [x] Current main default-on location-gateway behavior, crawler bypass, rollback contract and mobile contrast fixes are synchronized into this feature branch.

## P2 — accessibility, performance and release validation

- [x] Reduced-motion handling exists for new premium interactions.
- [x] Keyboard focus states and mobile catalogue-dialog behavior have been strengthened.
- [x] Hero merchant photography uses `next/image` responsive optimization and priority loading when it is the primary visual.
- [ ] Run final keyboard, zoom/text enlargement, empty-state, unavailable-variant, one/many cart-item and mobile-keyboard acceptance sweep.
- [ ] Measure field/lab LCP, INP and CLS before production release; review targets are LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 at p75.

## Release rule

Do not merge this branch to `main` solely because it builds. Merge only after the latest Vercel preview is READY, the responsive acceptance sweep passes, key shopping regressions pass, and the remaining delivery/payment-data dependencies are either integrated or explicitly scoped out without misleading customer copy.

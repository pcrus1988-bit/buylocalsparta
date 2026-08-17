# Buy Local Sparta Build 0.44.0 — Storefront Category Merchandising Report

## Scope

Build 0.44.0 continues customer-facing website development after the Build 0.43 deployment-topology hardening. The release focuses on discovery, visual hierarchy and category navigation while deliberately preserving the canonical-product and Fair Vendor Exposure boundaries.

## Category discovery layer

Added a shared customer-facing taxonomy in `apps/web/src/lib/storefront-taxonomy.ts` with six primary routes:

- `/category/home-living`
- `/category/fashion`
- `/category/beauty`
- `/category/kids`
- `/category/technology`
- `/category/gifts`

The taxonomy maps operational category codes into stable discovery groups without changing the authoritative catalog taxonomy. Examples include `home-lighting` → Home & Living, `stationery` → Gifts, `toys` → Kids and `technology` → Technology.

## Fairness-safe category filtering

`getCatalogCards` now accepts an optional category filter. In PostgreSQL mode, public canonicals are filtered by category before `publicAssignedCanonical(... reason: "search_card")` is invoked. In demo mode, public canonical variants are filtered before the same fairness-selection flow.

This means category pages do not create a second listing model and do not reveal hidden vendor offers, supplier prices or parallel merchant bids.

## Storefront visual system

Added `CatalogProductCard`, reused on:

- homepage selections;
- `/shop` results;
- category landing pages;
- public vendor catalog profiles.

Cards now derive their visual treatment from the canonical `categoryCode`, replacing the previous generic numbered artwork. Product detail pages use the same category visual treatment and provide a route back into category discovery.

The visuals are intentionally code-generated merchandising treatments rather than fabricated merchant/product photography. Approved photography can replace them later through the existing media-governance pipeline.

## Shop and saved search behavior

`/shop` now supports:

- category chips;
- category select filtering;
- category-aware headings/search hints;
- category filtering combined with availability, query and price sort.

Saved searches now retain `categoryCode`, and current-match evaluation respects the same storefront taxonomy mapping.

`/api/catalog` also accepts `q` and `category` parameters and returns `categoryCode` in the public response.

## Regression gate

Added `npm run check:storefront`, which verifies:

- six unique primary category slugs;
- representative operational-code mappings;
- unrelated categories do not cross-match;
- category landing pages use `getCatalogCards`;
- `/shop` applies the category filter server-side;
- PostgreSQL category browsing still assigns through `reason: "search_card"`;
- public cards derive visuals from canonical category codes.

## Validation performed locally

- full `npm run check` release suite passed, including project consistency, deployment topology, preview-auth, 37 migrations, provider suites, development UI syntax, accessibility structure and the dependency-free HTTP smoke journey;
- storefront category regression gate passed for all six primary categories;
- 382 TS/TSX source files transpiled with zero syntax errors;
- 382 TS/TSX source files scanned with zero broken relative imports (fixture strings excluded from import detection);
- the complete dependency-backed Next.js build remains a Node 24 / installed-dependency CI or Vercel gate, consistent with Build 0.43.

## Remaining visual/media work

- connect approved canonical product photography to public cards and detail pages;
- connect approved merchant portraits/store photography to vendor storytelling pages;
- run human mobile and WCAG 2.2 AA review on the new category routes;
- validate the full production Next.js build under Node 24 after dependency installation.

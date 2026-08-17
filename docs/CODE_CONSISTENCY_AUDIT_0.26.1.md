# Buy Local Sparta — Code Consistency Audit 0.26.1

**Audit source:** Build 0.26.0  
**Corrected build:** 0.26.1  
**Audit date:** 15 August 2026  
**Scope:** consistency, deployability, customer-web/runtime correctness and regression safety. No marketplace finance, settlement, return, tax or immutable SQL migration semantics were rewritten in this patch.

## Executive result

Build 0.26.0 passed its existing 209-test/28-migration verification suite before the audit, but the audit found several integration inconsistencies that those tests did not cover. The most important were release identity drift, an npm workspace dependency form rejected by the available npm toolchain, shared hard-coded Fair Vendor Exposure visitor identities in the production Next.js surface, phantom supplier-exposure events, out-of-stock catalog failure behavior, and mismatch between browser-cart/checkout assumptions and backend truth.

The proven inconsistencies were corrected in 0.26.1 and a new `check:consistency` gate was added so key classes of drift fail `npm run check` in future.

## Findings and fixes

### Critical / high-impact

1. **Production fairness identity was shared between unrelated visitors.**  
   The Next.js homepage/shop/checkout used fixed demo visitor keys. This could make unrelated visitors share sticky supplier attribution and contaminate exposure accounting.  
   **Fix:** `apps/web/src/proxy.ts` now creates or validates an opaque HttpOnly per-browser visitor cookie, overwrites the internal `x-bls-visitor` request header, and production pages/APIs consume only that trusted internal identity.

2. **Phantom Fair Vendor Exposure events were created for products not actually shown.**  
   Product detail previously resolved the whole catalog, shop query filtering happened after assignment, and vendor profiles resolved marketplace assignments merely to build a vendor page.  
   **Fix:** public-card resolution is now per canonical product; search filters canonical variants before fairness assignment; vendor profile product projection reads vendor-capable offers without mutating fairness; metadata uses canonical public data only.

3. **Sold-out/stale products could crash catalog resolution.**  
   UI types allowed `available: false`, but fairness selection could throw when no supplier was eligible. Static `stockFresh` values could also diverge from checkout TTL rules.  
   **Fix:** catalog resolution recomputes `offerStockIsFresh`, checks eligibility before selecting, and returns an unavailable canonical card when no supplier is eligible.

4. **Fresh npm install could fail before Next.js build.**  
   `apps/web/package.json` used `@buy-local-sparta/core: workspace:*`; the available npm toolchain rejected it with `EUNSUPPORTEDPROTOCOL`.  
   **Fix:** the web workspace now depends on the local core package by its matching semver (`0.24.0`), which permits npm workspace linking. A subsequent install attempt progressed past protocol parsing and failed only because this execution environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`).

5. **Production Next.js lacked the security-header baseline claimed by the project.**  
   The dependency-free server emitted CSP, anti-framing, MIME/referrer/permissions, COOP/CORP and HSTS controls; the deployable Next.js config did not.  
   **Fix:** `apps/web/next.config.ts` now applies the corresponding security header set to the production web surface.

### Medium-impact

6. **Build/version identity drift.**  
   Root/web/docs identified 0.26.0 while development server health/smoke/UI still hard-coded 0.24.  
   **Fix:** runtime build identity is read from root package metadata; web health reads web package metadata; smoke/UI derive from the same source.

7. **Checkout idempotency did not fully represent checkout intent.**  
   A new key was previously generated for every submit, so a lost response followed by retry could create duplicate work. An initial fix persisted the key only by cart contents; changing postcode or fulfilment mode could then reuse old intent.  
   **Fix:** one session idempotency key is persisted by **cart + postcode + fulfilment mode**, surviving equivalent retries while changing when the checkout request meaningfully changes.

8. **Checkout accepted malformed intent too leniently.**  
   Unsupported fulfilment values silently became pickup; request item/count/postcode/visitor boundaries were weak.  
   **Fix:** API validation now requires trusted visitor identity, a five-digit postcode, an explicit valid fulfilment mode, 1–100 items, bounded canonical IDs and integer quantity 1–99.

9. **Browser cart trusted malformed localStorage.**  
   Stored objects with missing title or invalid price could survive hydration and later break rendering/subtotals; UI quantity selection only exposed 1–9 while backend accepted 1–99.  
   **Fix:** persisted cart schema is validated before hydration; quantities are bounded to 99; UI and API ranges agree.

10. **Customer UI overstated browser-calculated totals.**  
    The browser subtotal excludes authoritative delivery/backend pricing but looked like the checkout total.  
    **Fix:** it is labeled estimated merchandise subtotal; successful checkout displays the backend-calculated total separately.

11. **Customer-facing production surface exposed development/test affordances.**  
    The homepage embedded the engineering checkout demo, product-card add controls were inert, and footer links pointed to `/admin`, `/vendor` and missing `/join` Next.js pages.  
    **Fix:** the test harness was removed from the storefront, product controls navigate to real product pages, dead privileged links were removed, and `/join` now has a truthful production-facing informational route without bypassing onboarding gates.

12. **Product advice buttons implied unavailable direct actions.**  
    **Fix:** controls now navigate to the existing Ask Local/advice sections rather than pretending to initiate an unwired chat/video call.

13. **Environment example omitted runtime variables actually consumed by the development server.**  
    **Fix:** `.env.example` now documents `PORT`, `PUBLIC_ORIGIN` and `TRUST_PROXY` alongside reserved production adapter variables.

## New anti-regression gate

`npm run check` now begins with `npm run check:consistency`. The gate checks:

- root/web build-version alignment and documentation identity;
- web-to-core dependency/version alignment and rejection of the incompatible `workspace:` protocol;
- dynamic development-server build identity rather than hard-coded semver;
- presence of the trusted Next.js visitor-header overwrite;
- absence of known shared production fairness visitor keys;
- presence of key production browser-security headers;
- existence of static Next.js routes referenced by literal internal links.

## Verification after fixes

The corrected source passed:

- **209/209 core automated tests**;
- **28/28 immutable migration checksum checks**;
- project consistency gate;
- 4 generated development UI syntax checks;
- 6 structural accessibility regression checks;
- complete HTTP critical-journey smoke workflow;
- dependency-free TypeScript syntax transpilation of all production-web `.ts`/`.tsx` sources.

The immutable migration set was not modified by this patch.

## Validation that remains external

These are deliberately not reported as completed:

1. **Real `next build` under Node 24.** The workspace protocol blocker is fixed, but the audit container cannot resolve the npm registry, so Next/React/type dependencies cannot be freshly installed here.
2. **Live PostgreSQL/PostGIS migration + concurrency/integration run.** No PostgreSQL server/`psql` is available in this environment.
3. **Production provider integrations.** PSP/payment, ERP/myDATA/digital dispatch, courier, object storage/media scanning and external notification credentials remain explicit launch gates.
4. **Human security/accessibility launch evidence.** Automated structural checks do not replace the planned penetration review and human WCAG audit.

## Files materially changed by the audit

- root release/config: `package.json`, `.env.example`
- release/runtime identity: `dev/build.ts`, `dev/server.ts`, `dev/smoke.ts`, `dev/ui.ts`
- consistency automation: `scripts/verify-project-consistency.ts`
- web package/security: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/src/proxy.ts`
- web identity/build helpers: `apps/web/src/lib/visitor.ts`, `apps/web/src/lib/build.ts`
- catalog/fairness projection: `apps/web/src/lib/catalog-view.ts`, catalog API and customer product/shop/vendor pages
- checkout/cart hardening: checkout API, `CartProvider`, cart UI and checkout UI
- customer-route cleanup: homepage, `/join`, health endpoint
- status/readme documentation and this report

## Recommendation for the next development pass

Run build 0.26.1 in a Node 24 CI/deployment environment with registry access and make `npm run check:web` a required merge/deployment check. Once that is green, continue the authenticated customer account surfaces and production vendor backoffice while keeping the new consistency gate mandatory.

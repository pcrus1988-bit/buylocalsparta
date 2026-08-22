# KONTΑ ΜΟΥ — SEO, Search Visibility & Index Governance Roadmap

Status: **active implementation workstream**

Working branch: `agent/seo-visibility-control-center`

Base branch: `main` (must remain unchanged until review/merge)

## Objectives

1. Make every intentionally public KONTΑ ΜΟΥ page discoverable, indexable and understandable by Google and other major search engines.
2. Ensure customer-, vendor-, staff-, admin- and system-only content cannot be exposed merely through a URL, sitemap, metadata, crawler discovery, API route or downloadable asset.
3. Turn the existing research-vendor dataset into a deliberately managed local-search surface (Model C) without producing thin, misleading or duplicate pages.
4. Improve product SEO without changing internal product identifiers, offer assignment, checkout, invoicing, stock, matching or other transactional processes.
5. Give administrators an in-house SEO & Visibility Control Centre for configuration, page-level overrides, diagnostics, reports and launch/readiness monitoring.
6. Preserve current `/vendor/*` route structure for this workstream to avoid avoidable regressions.

---

## Guiding model

Every route/entity must resolve to exactly one visibility class:

- **PUBLIC_INDEXABLE** — public, crawlable, canonical, eligible for sitemap/indexing.
- **PUBLIC_NOINDEX** — public for humans but excluded from search results.
- **AUTHENTICATED_PRIVATE** — session/role protected and excluded from indexing.
- **INTERNAL_SYSTEM** — server/admin/system only; never exposed as public content.

Security and search directives are separate controls:

- Authentication/authorization protects information.
- `noindex` controls indexing.
- `robots.txt` controls crawler access/crawl budget and is never treated as an access-control mechanism.

---

# Phase 0 — Security and index-governance foundation (P0/P1)

Implementation status: **foundation implemented on the working branch.**

## 0.1 Secret/diagnostic hardening

- Remove hard-coded diagnostic credentials from repository code.
- Read diagnostic/upstream credentials only from server-side environment variables where the route is genuinely required.
- Disable research seed diagnostics in production by default.
- Return `Cache-Control: private, no-store` for internal diagnostics.
- Add repository secret-pattern checks for future CI.
- Operational follow-up outside code: rotate any credential previously published in Git history.

Acceptance:

- No hard-coded diagnostic token/function key in application source.
- Production diagnostic route is disabled unless explicitly enabled by secure configuration.

## 0.2 Central visibility policy

Create a single source of truth that classifies route families and supports entity-level decisions.

Minimum route groups:

- Public indexable: `/`, `/shop`, `/shops`, `/shops/map`, approved `/category/*`, approved `/product/*`, index-approved `/vendor/[id]`, selected public informational pages.
- Public noindex: login, registration, application flows, transient search/filter result surfaces where appropriate.
- Authenticated private: `/account/*`, private `/vendor/*` workspace routes, `/admin/*`, `/daily/*`, checkout/order/private-document surfaces.
- Internal: private APIs, diagnostics, jobs, callbacks not intended as public content.

Acceptance:

- Diagnostics can report classification for every known route family.
- Admin tooling shows conflicts (for example sitemap inclusion + noindex, or public indexable + authorization requirement).

## 0.3 robots/noindex correction

- Keep broad protection of genuinely internal API routes.
- Do not use `robots.txt` as the primary mechanism for keeping authenticated HTML pages out of Google.
- Allow crawler access where Google must read an explicit `noindex` directive.
- Preserve authentication regardless of crawler configuration.

## 0.4 Public media crawlability

- Keep public media authorization/approval checks.
- Make approved public product/vendor/hero images crawlable.
- Keep private media and arbitrary storage objects inaccessible.
- Diagnostics must verify that every image referenced in indexable structured data returns a crawlable public response.

---

# Phase 1 — Admin SEO & Visibility Control Centre

New admin subsection: `/admin/seo`

Suggested navigation label: **SEO & Visibility** under **Περιεχόμενο**, with diagnostics/reporting available as tabs/subsections.

## 1.1 Overview dashboard

Implementation status: **implemented on the working branch.**

Cards/KPIs:

- indexable URLs
- public noindex URLs
- protected/private route families
- sitemap URL count
- products eligible for index
- research vendors eligible for index
- partner vendors eligible for index
- missing titles/descriptions/canonicals
- duplicate titles/descriptions
- missing/blocked structured-data images
- orphan/weakly-linked pages
- invalid sitemap entries
- visibility-policy conflicts
- latest diagnostic run and score

## 1.2 Global SEO settings

Implementation status: **editable governed foundation implemented on the working branch.** Settings are stored in the existing market-scoped `system_settings` registry with optimistic version checks and append-only `audit_events` evidence. The current UI controls canonical/default metadata, the guarded global indexing switch, Research-vendor indexing/threshold, sitemap entity families, public-media crawler policy and Google verification. Entity-specific overrides are implemented in Phase 1.3 below.

Manageable fields:

- canonical site origin
- default title template
- default description
- organization/site name
- default Open Graph image
- global indexing master switch for emergency use (guarded, audited)
- research-vendor indexing policy
- minimum research-vendor quality threshold
- sitemap enable/disable by entity type
- public media crawl policy
- search engine verification values where applicable

All writes:

- admin permission protected
- CSRF protected
- audited with before/after values
- safe defaults if persistence is unavailable

## 1.3 Page/entity SEO registry

Implementation status: **governed override registry implemented on the working branch.** Static pages, curated categories, public canonical products, partner vendors and Research vendors now resolve through one market-scoped registry. Generated metadata remains the default; intentional overrides are permission/CSRF protected, optimistic-version checked and append-only audited. Global indexing, public entity admission, sitemap-family controls and hard Research quality blockers remain authoritative. Persisted override fields now drive page metadata, canonical URLs, index/noindex, XML sitemap admission and Product/LocalBusiness schema eligibility.

Manage SEO for:

- static public pages
- categories
- products
- partner vendors
- research vendors

Editable/overridable fields where appropriate:

- index allowed
- sitemap allowed
- SEO title
- meta description
- canonical URL override (strictly validated)
- Open Graph title/description/image
- schema eligibility
- search snippet preview
- internal-search keywords / editorial label
- quality status
- last reviewed timestamp

The system should prefer generated sensible defaults and use overrides only where an admin intentionally supplies them.

## 1.4 Diagnostics

Implementation status: **core diagnostics plus crawl-graph diagnostics implemented.** `/admin/seo/crawl` builds a governed internal-link model for every indexable static page, category, product, partner vendor and Research vendor and separates orphan pages from pages with only one stable discovery source.

In-house checks should include:

- HTTP reachability/status
- canonical presence and consistency
- robots meta
- robots.txt conflict
- sitemap inclusion/exclusion consistency
- title/description lengths and duplication
- H1 presence/basic document structure
- structured data syntax/presence
- Product/Offer seller/image completeness
- LocalBusiness completeness
- image crawlability
- broken internal links
- orphan candidates
- private-route anonymous access probes (safe allowlist of internal test targets)
- cache/privacy header checks for protected downloads/APIs
- accidental UUID/public-internal-ID leakage indicators where relevant

Diagnostics must never store credentials, raw session cookies, private customer data or document contents.

## 1.5 Reports

Implementation status: **persisted reporting foundation implemented on the working branch.** Authorised Admin users can capture the current aggregate SEO inventory, route-policy counts, runtime readiness and sanitized diagnostic results as a bounded 50-snapshot history. Creation is permission/CSRF protected and append-only audited. Saved reports expose protected, private/no-store/noindex JSON and UTF-8 CSV downloads. The displayed trend compares the two latest internal health scores.

Persist/read-only snapshots:

- overall SEO health score
- indexability inventory
- errors / warnings / opportunities
- entity type breakdown
- changed-since-last-run comparison
- exportable CSV/JSON diagnostic result
- launch readiness checklist

---

# Phase 2 — Research vendor local SEO (Model C)

Business decision: **Research vendors are an intentional local-directory/search surface.**

Implementation status: **quality-gated indexing and sitemap admission implemented on the working branch.** Quantity does not override quality.

## 2.1 Eligibility gate

A research vendor becomes indexable only when the record passes a quality threshold, for example:

Required core signals:

- non-placeholder business/store name
- meaningful category/branch classification
- Sparta/catchment address or usable locality
- at least one useful public contact/discovery signal (website, phone, address/location)
- no suppression/opt-out flag
- no obvious duplicate/closed/business-invalid status

Recommended signals:

- description/editorial summary
- opening hours
- coordinates
- website/e-shop
- logo/photo
- verified/reviewed timestamp

Records below threshold may remain public for human discovery where appropriate, but are `noindex` and omitted from the XML sitemap.

## 2.2 Transparency

Research-vendor public pages must clearly distinguish:

- KONTΑ ΜΟΥ partner stores
- directory/research listings not yet partnered

Avoid language that implies a commercial relationship where none exists.

Provide correction/claim/opt-out path.

## 2.3 Sitemap + LocalBusiness

Index-eligible research vendors:

- become sitemap candidates
- receive canonical URL
- receive LocalBusiness schema based only on available public/verified fields
- use a real reviewed/checked timestamp for `lastmod` when available
- appear in the governed human `/sitemap` directory as a second stable internal discovery path

## 2.4 Duplicate prevention

Before indexing:

- deduplicate business names/addresses/domains/phones
- canonicalize multiple records referring to the same storefront
- avoid empty near-identical page templates

---

# Phase 3 — Product SEO without transactional breakage

Internal canonical IDs remain authoritative and unchanged.

Implementation status: **metadata/media, friendly URLs, product quality/index gating and crawler-safe offer rendering are implemented on the working branch.** The existing market-unique `canonical_variants.slug` is exposed only through the public catalogue projection and used as the preferred presentation URL. Legacy `/product/{public-id}` requests resolve the same admitted canonical product and permanently redirect to `/product/{slug}` before personalised offer assignment. Carts, fairness, inventory, checkout, orders, tax and finance continue to receive the unchanged canonical product ID. Sitemap, catalogue cards, customer saved/recent/recommended product links, order-detail links, canonical metadata and Product/Offer schema now use the friendly route. Product metadata consumes approved public imagery and catalogue descriptions, publishes Twitter/X card fallbacks, and enriches schema with governed GTIN/condition data without using the internal canonical ID as a fallback SKU. A second gate above the existing public safety/admission projection scores meaningful title, classification, description, approved image, public identifier/brand and variant differentiation. Thin or unresolved duplicate records remain human-visible but are `noindex`, excluded from the sitemap and visible in Admin diagnostics; eligible records can still be narrowed through audited entity overrides, while hard content/identity blockers cannot be bypassed.

## 3.1 Metadata and schema

For every public canonical product:

- generated unique SEO title
- meaningful description fallback
- explicit canonical
- Product + Offer schema based on a real eligible public offer
- seller relationship
- availability/price where valid
- crawlable primary image
- canonical breadcrumbs

Search/social crawler rendering does **not** consume Fair Vendor Assignment. Instead it selects a currently eligible approved local offer through a strictly read-only projection and exposes that offer's real customer price, vendor and stock. The projection does not update fairness rotation state, create sticky assignments, increment qualified exposures or write fairness-assignment events. Normal customer requests continue through the existing personalised Fair Vendor Assignment path. This keeps crawler-visible commerce content materially aligned with customer-visible content without allowing crawler traffic to distort merchant fairness.

## 3.2 Human-friendly URLs

Do not change database/internal references.

The existing stable catalogue slug is now used as the public presentation route. Existing public-ID URLs continue to resolve the same admitted product and permanently redirect before customer personalization/fairness assignment.

## 3.3 Product quality/index eligibility

Do not index products that are:

- suppressed/unsafe
- effectively empty
- duplicated without a canonical relationship
- missing minimum public content needed for a useful search result

Implementation status: **implemented.** The public canonical admission boundary remains authoritative for inactive, suppressed, recalled and unsafe products. The quality gate does not deindex merely because stock is temporarily unavailable; stable content/entity quality is assessed separately from live offer availability.

---

# Phase 4 — Sitemap, canonicals and crawl graph

Implementation status: **core crawl architecture and governed internal-link coverage implemented. Honest product-freshness policy is now explicit and release-tested.**

Implemented:

- Sitemap is governed by global settings, entity quality and explicit per-entity overrides.
- Homepage has an explicit governed self-canonical.
- Approved public-media paths remain crawlable while private APIs remain outside the public crawl graph.
- Homepage links every curated category consistently rather than only categories represented in the rotating four-product selection.
- Category pages and the public catalogue expose product links while product breadcrumbs use canonical category URLs.
- Arbitrary `/shop?...` and `/shops?...` search/filter combinations are `noindex,follow` with clean canonical targets, preventing query-parameter index bloat without breaking filtering UX.
- `/admin/seo/crawl` models stable inbound discovery paths and reports orphan/weak-link indexable entities.
- The human `/sitemap` exposes only governed/index-approved vendors, including quality-approved Research listings, grouped by category. Held-back/noindex records stay absent.
- Search/social crawler requests use a dedicated read-only public-offer projection. Crawlers can render homepage, shop, category and product content without creating `sticky_assignments`, incrementing `qualified_exposures` or writing Fair Vendor Assignment events.
- Normal customer traffic continues to use the unchanged Fair Vendor Assignment path.
- Product `lastmod` deliberately uses only an explicit governed `lastReviewedAt` today. Although `canonical_variants.updated_at` exists, `product_translations` has no update timestamp and approved-media changes are separate; therefore no single reliable public-content update clock exists yet. Deployment time, `Date.now()` and incomplete canonical timestamps are explicitly rejected as sitemap freshness signals.
- The SEO release verifier enforces the above freshness and crawler/fairness invariants.

Future refinement, not a reason to fabricate current sitemap data:

- Introduce a unified product public-content change timestamp only when all title/description/variant/media publication edits reliably advance it. At that point product `lastmod` can use that clock.
- Expand live broken-link/reachability probes once an automated smoke client can access the application preview without the Vercel SSO interstitial.

---

# Phase 5 — Search-engine integration and observability

## 5.1 Google Search Console readiness

Implementation status: **optional server-only integration boundary implemented.**

Admin route: `/admin/seo/search-console`

Implemented:

- read-only Google Search Console adapter using the `webmasters.readonly` scope
- URL-prefix or `sc-domain:` property configuration
- service-account JWT/OAuth authentication without an additional runtime dependency
- credentials read exclusively from server environment variables
- no Search Console private key/client credential stored in `system_settings`, reports, HTML or client-side code
- aggregate Search Analytics snapshot in Admin when the integration is connected
- readiness diagnostics for property, service-account credentials, indexing master state and public verification metadata
- bounded URL Inspection adapter available server-side without automatic mass inspection

Operational activation still required outside code:

1. Enable the Search Console API in the relevant Google Cloud project.
2. Create/use a dedicated service account.
3. Add the service-account email as an authorized user on the Search Console property.
4. Set the server-only Vercel environment variables documented in `.env.example`.
5. Turn `BLS_GOOGLE_SEARCH_CONSOLE_ENABLED=true` only after the above is complete.
6. Confirm aggregate Search Analytics succeeds before adding quota-aware URL Inspection report runs.

## 5.2 Ongoing monitoring

Implementation status: **in-house snapshot regression watch implemented.** The Admin report history now compares the two latest immutable snapshots using governed noise thresholds and surfaces new critical diagnostics, material health/inventory drops, runtime availability loss, orphan growth, weak-link growth and route-policy inventory changes. The comparison is derived at read time, so older snapshots remain compatible and no new sensitive data or migration is introduced.

Scheduled/in-house diagnostics should detect regressions such as:

- newly public admin/account route
- new page lacking noindex/index policy
- new public product missing canonical/schema/image
- sitemap returning private/noindex URLs
- public structured-data image blocked by robots/auth
- sudden drop in index-eligible entity counts
- sudden growth in orphan/weakly-linked indexable entities
- Search Console API/property authorization becoming unavailable once connected

---

# Phase 6 — Tests and release gate

Required before merging to `main`:

- existing test suite passes
- build/typecheck passes
- route visibility policy checks
- sitemap inclusion/exclusion and honest-freshness checks
- robots checks
- anonymous private-route access checks
- public product/vendor crawl checks
- crawler/fairness isolation checks, including real read-only public-offer rendering with no fairness writes
- diagnostic tool checks
- admin RBAC/CSRF checks
- migration/schema verification where applicable
- preview deployment smoke test against an application-accessible preview

Current limitation: Vercel preview deployment builds are green, but direct automated application-page smoke requests are intercepted by the project's Vercel SSO protection. The interstitial itself is `noindex`; this is recorded as an environment limitation rather than treated as successful application HTML validation.

No production database migration or secret rotation should be executed implicitly by merging application code. Those operational steps must be explicit release actions.

---

# Implementation order

1. ✅ P0 credential/diagnostic hardening.
2. ✅ Central route/index visibility policy.
3. ✅ Correct robots + approved-media crawling.
4. ✅ `/admin/seo` overview and diagnostics foundation.
5. ✅ Persistence/settings + audited editing.
6. ✅ Research-vendor Model C eligibility + sitemap/schema integration.
7. ✅ Product SEO/canonical/quality enhancements.
8. ✅ Internal-link/crawl-graph + governed human sitemap + query-index control + crawler/fairness isolation.
9. ✅ Persisted diagnostic reporting/export foundation.
10. ✅ Optional server-only Search Console integration boundary.
11. ✅ Honest product `lastmod` policy + automated release invariant.
12. 🟡 Final CI/release validation, application-accessible preview smoke review, operational credential rotation/Search Console activation, then only after approval merge to `main`.

---

# Non-goals for this branch unless required for correctness

- Do **not** rename or relocate the `/vendor` workspace or current public `/vendor/[id]` route family merely for SEO aesthetics.
- Do **not** change internal order/product/vendor identifiers used by finance, tax, procurement, checkout or audit systems.
- Do **not** deploy database migrations to production automatically.
- Do **not** push/merge the work into `main` without review.

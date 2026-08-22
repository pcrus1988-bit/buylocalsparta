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

Implementation status: **persisted reporting foundation implemented on the working branch.** Authorised Admin users can capture the current aggregate SEO inventory, route-policy counts, runtime readiness and sanitized diagnostic results as a bounded 50-snapshot history. Creation is permission/CSRF protected and append-only audited. Saved reports expose protected, private/no-store/noindex JSON and UTF-8 CSV downloads. The displayed trend compares the two latest internal health scores. Launch-checklist expansion and Search Console ingestion remain future work.

Persist/read-only snapshots:

- overall SEO health score
- indexability inventory
- errors / warnings / opportunities
- entity type breakdown
- changed-since-last-run comparison
- exportable CSV/JSON diagnostic result
- launch readiness checklist

Future-ready integration boundary for Google Search Console data, without making the application depend on Search Console for core functionality.

---

# Phase 2 — Research vendor local SEO (Model C)

Business decision: **Research vendors are an intentional local-directory/search surface.**

However, quantity must not override quality.

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

Records below threshold may remain visible in internal admin/research tools but should not be indexed.

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
- have accurate `lastmod`

## 2.4 Duplicate prevention

Before indexing:

- deduplicate business names/addresses/domains/phones
- canonicalize multiple records referring to the same storefront
- avoid empty near-identical page templates

---

# Phase 3 — Product SEO without transactional breakage

Internal canonical IDs remain authoritative and unchanged.

Implementation status: **metadata/media, friendly URLs and the product quality/index gate are implemented on the working branch.** The existing market-unique `canonical_variants.slug` is exposed only through the public catalogue projection and used as the preferred presentation URL. Legacy `/product/{public-id}` requests resolve the same admitted canonical product and permanently redirect to `/product/{slug}` before personalised offer assignment. Carts, fairness, inventory, checkout, orders, tax and finance continue to receive the unchanged canonical product ID. Sitemap, catalogue cards, customer saved/recent/recommended product links, order-detail links, canonical metadata and Product/Offer schema now use the friendly route. Product metadata also consumes approved public imagery and catalogue descriptions, publishes Twitter/X card fallbacks, and enriches schema with governed GTIN/condition data without using the internal canonical ID as a fallback SKU. A second gate above the existing public safety/admission projection now scores meaningful title, classification, description, approved image, public identifier/brand and variant differentiation. Thin or unresolved duplicate records remain human-visible but are `noindex`, excluded from the sitemap and visible in Admin diagnostics; eligible records can still be narrowed through audited entity overrides, while hard content/identity blockers cannot be bypassed.

## 3.1 Metadata and schema

For every public canonical product:

- generated unique SEO title
- meaningful description fallback
- explicit canonical
- Product + Offer schema
- seller relationship
- availability/price where valid
- crawlable primary image
- breadcrumbs

## 3.2 Human-friendly URLs

Do not change database/internal references.

Introduce human-readable slugs only as a presentation/routing layer, with one stable canonical URL and safe fallback support for the existing ID-based route.

Possible target pattern:

`/product/{slug}-{short-stable-id}`

or equivalent, selected only after compatibility testing.

Existing URLs must continue to resolve and permanently redirect/canonicalize safely once the slug layer is introduced.

## 3.3 Product quality/index eligibility

Do not index products that are:

- suppressed/unsafe
- unavailable according to policy
- effectively empty
- duplicated without a canonical relationship
- missing minimum public content needed for a useful search result

Implementation status: **implemented.** The public canonical admission boundary remains authoritative for inactive, suppressed, recalled and unsafe products. The quality gate does not deindex merely because stock is temporarily unavailable; stable content/entity quality is assessed separately from live offer availability.

---

# Phase 4 — Sitemap, canonicals and crawl graph

- Sitemap becomes the authoritative registry of URLs KONTΑ ΜΟΥ actively wants indexed.
- Add reliable `lastmod` values.
- Keep sitemap free of authenticated/private/noindex URLs.
- Add homepage canonical.
- Build internal links between homepage → categories → products → vendor pages and vendors → products/categories where meaningful.
- Avoid indexable arbitrary filter/query URL explosion.
- Add breadcrumb links/schema consistently.

---

# Phase 5 — Search-engine integration and observability

## 5.1 Google Search Console readiness

Admin should expose:

- sitemap URL
- verification status/config placeholder
- direct inventory of URLs suitable for inspection
- clear separation between local diagnostics and external Google indexing status

Search Console API integration may be added later behind explicit credentials/permissions.

## 5.2 Ongoing monitoring

Scheduled/in-house diagnostics should detect regressions such as:

- newly public admin/account route
- new page lacking noindex/index policy
- new public product missing canonical/schema/image
- sitemap returning private/noindex URLs
- public structured-data image blocked by robots/auth
- sudden drop in index-eligible entity counts

---

# Phase 6 — Tests and release gate

Required before merging to `main`:

- existing test suite passes
- build/typecheck passes
- route visibility policy unit tests
- sitemap inclusion/exclusion tests
- robots tests
- anonymous private-route access tests
- public product/vendor crawl tests
- diagnostic tool tests
- admin RBAC/CSRF tests
- migration/schema verification if persistence is added
- preview deployment smoke test

No production database migration or secret rotation should be executed implicitly by merging application code. Those operational steps must be explicit release actions.

---

# Implementation order

1. P0 credential/diagnostic hardening.
2. Central route/index visibility policy.
3. Correct robots + approved-media crawling.
4. `/admin/seo` read-only overview and diagnostics foundation.
5. Persistence/settings + audited editing.
6. Research-vendor Model C eligibility + sitemap/schema integration.
7. Product SEO/canonical enhancements.
8. Internal-link/crawl-graph improvements.
9. Full diagnostic reporting/export.
10. Preview validation, tests, review, then only after approval merge to `main`.

---

# Non-goals for this branch unless required for correctness

- Do **not** rename or relocate the `/vendor` workspace or current public `/vendor/[id]` route family merely for SEO aesthetics.
- Do **not** change internal order/product/vendor identifiers used by finance, tax, procurement, checkout or audit systems.
- Do **not** deploy database migrations to production automatically.
- Do **not** push/merge the work into `main` without review.

# KONTA MOY — evidence-first untapped-keyword pilot (18 Oct 2026)

**Status:** Proposed experiment; no production ranking, noindex or sitemap changes are made in this PR. Owner reviews candidate queries and publishes only truthful, useful content.

## Baseline: connected Search Console

Property: `sc-domain:kontamou.site`. SMEPost GSC opportunity read (18 October 2026); finalized comparison window 18 September–15 October 2026 vs 21 August–17 September 2026. Data may lag around three days. The external opportunity tool's returned top rows are *not* a full query universe.

Three research vendor examples (current period):
- `/vendor/vendor_research_census_0193`: 170 impressions, 3 clicks, ~1.8% CTR, mean position 4.47.
- `/vendor/vendor_research_census_0064`: 113 impressions, 2 clicks, ~1.8% CTR, mean position 4.47.
- `/vendor/vendor_research_census_0258`: 110 impressions, 0 clicks, mean position 3.35.

These pages are intentionally subject to existing independent evidence, quality and approval gates. **Do not automatically noindex or edit them just because their CTR is low.** Review whether the business dossier provides genuine distinct value, canonical consistency, transparency and truthful merchant relationship.

## What this PR adds

- A read-only, privacy-preserving keyword opportunity screen in `/admin/seo/search-console`, using the **existing** sanitized and aggregate GSC query snapshots, with no new database or Google API requests.
- A conservative priority heuristic: non-brand queries, >=20 impressions, valid position, visible low CTR or striking-distance positions 4–20; score is *not* a click forecast or independently measured search volume.
- Research-census page exposure callout, for manual verification under existing vendor publication policy.
- Testable rules in `seo-opportunity-signals.ts`. No index-state changes, automatic content publication, keyword stuffing, paid link swaps, or broad page generation.

## Measured experiment

1. **Technical baseline first.** Confirm HTTP 200/indexable canonical documents; robots/meta consistency; no unintended location redirect; page loads; server-rendered text and accessible HTML links. Capture baseline Search Console URL inspection and page-level metrics.
2. **Choose 3 experimental targets** from non-branded, intent-appropriate GSC candidates on already-indexable pages. Prefer existing `/category/*`, `/shop`, `/shops` or real vendor/product pages. Confirm eligible category inventory and location relevance. Pick 3 comparable, unchanged pages as control.
3. **Analyze competitor SERPs manually** for each candidate. The Reddit suggestion to find low-authority competitors via Ahrefs can be a useful discovery technique, but low authority does not itself prove low competition, business value, or that our page satisfies the intent. No claim that a term is untapped without checking competing search results.
4. **Improve the 3 pages** with genuinely useful Greek-language content, accurate local availability/merchant status, descriptive heading/title, helpful comparison or buying advice, and real semantic internal links from related pages. Avoid fabricated stock, prices or customer reviews.
5. **Measure** Search Console non-branded clicks, impressions, CTR, indexed coverage, query-by-page rankings and relevant conversion events on the same search type/device/country over matched periods. Distinguish changes from seasonality, indexing fixes and sitewide releases; hold target + controls for at least 4–8 weeks after changes. Do not promise ranking gains.
6. **Scale only what works.** Expand to further categories and city hubs when their business/merchant approval and actual on-page value satisfy editorial/indexing gates.

### Decision gates

- Failed crawl/indexability: stop keyword expansion and fix technical problems.
- Insufficient query data: log candidate topics but **do not** label them validated keyword opportunities.
- Census exposure: review identity/evidence quality, not CTR alone.
- Proven positive test: proceed gradually with fresh measurement snapshots and manual QA.

Google recommends people-first content and descriptive crawlable links; it does not endorse arbitrary keyword volume, link exchanges or guarantees from internal-link changes.

Official sources:
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/crawling-indexing/links-crawlable
- https://developers.google.com/search/docs/essentials/spam-policies

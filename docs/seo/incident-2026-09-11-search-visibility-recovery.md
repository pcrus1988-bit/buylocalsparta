# KONTA MOY — Google Search visibility recovery

Incident opened: 2026-10-10. Property: `sc-domain:kontamou.site`. Public domain: `https://kontamou.site/`.

## Verified Search Console evidence (as of 2026-10-10)

- Google Web impressions on 2026-09-10: **161**.
- Google Web impressions on 2026-09-11: **4** (**97.5%** day-over-day decline).
- 2026-09-01 through 2026-09-10: **2,140 impressions** (**214 per day** on average).
- Latest settled 28-day Search Console summary through 2026-10-06: **403 impressions and 45 clicks**; previous 28-day comparison: **2,932 impressions and 98 clicks**.
- Homepage URL inspection: **Submitted and indexed**, mobile fetch successful, Google-selected canonical `https://kontamou.site/`, last crawled 2026-10-09.
- One sample product URL inspection: **Submitted and indexed**, mobile fetch successful, matching user/Google canonical. This disproves the literal inference that "0 indexed" in the sitemap-level content counts means *every* product URL has been removed.
- Submitted sitemaps at audit: 67 total, including sitemap index and core. Sitemap-level `contents.indexed` reports 0 in all returned entries, **which is not an independently reliable total**; investigate via Page Indexing and URL Inspection. Directly submitted `/sitemaps/products/64.xml` reports one error; production sitemap index exposes shards **0–63** only. Remove the stale 64 entry in Search Console; do not advertise a nonexistent shard.
- Branded query coverage was not visible in the anonymized/limited Search Console query result; missing rows **do not prove zero branded impressions**.

## Confirmed infrastructure risk

Vercel production runtime error aggregation (prior seven days on 2026-10-10) includes:
- `(EMAXCONN) max client connections reached, limit: 200` on `/shop`, `/shops`, `/product/[id]`, `/advice` and other public routes.
- `timeout exceeded when trying to connect` affecting products, vendors, public pages and admin pages.
- `canceling statement due to statement timeout` including public catalogue and product routes.
- Research SES webhook timeouts and exhausted connections, with high-volume background work competing for the same database.

These prove instability, but do **not** by themselves prove the Sept 11 root cause or Google's ranking calculations. Preserve deployment/log evidence around Sept 10–12 and correlate with crawl-stats failure categories.

## Corrective patch in this PR

Previously a database error while rendering `/sitemaps/products/[shard]` returned HTTP 200 with a syntactically valid **empty** sitemap. That can falsely report that a previously populated sitemap no longer contains any product URLs. On transient failure the route now returns **503 + Retry-After + no-store**, so Google can retry rather than ingesting a false empty URL list.

Do not use this behavior for intentionally disabled product sitemaps; those remain explicit valid empty sitemaps governed by admin settings. Keep normal healthy shard caching intact.

## Follow-up priority order

1. **Runtime reliability:** reduce database connection exhaustion and excessive simultaneous research/supplier ingestion jobs. Audit total concurrency across Vercel instances, cron schedules, Supabase/pooler backends and any workers. Move bulk jobs off request-sensitive shared connections. Enforce bounded request-time read models and hard query timeouts with useful fallbacks where safe. Do not compromise authentication, checkout or current-stock checks.
2. **Crawl health:** validate actual HTTP responses from Googlebot for `/`, `/robots.txt`, `/sitemap.xml`, `/sitemaps/core/sitemap.xml`, sample product shards, `/shop`, partner vendor pages and canonical products. Verify robots/noindex/X-Robots, redirects, canonical tags, mobile HTML, and errors in Search Console Crawl Stats and Page Indexing.
3. **Sitemap correctness:** verify shards 0–63 with syntactically correct XML, honest `lastmod` when available, stable canonical URLs and product quality admission. Remove manually submitted stale shard 64. Resubmit **the sitemap index only after verifying** content and deploying the patch. Avoid repeated bulk submissions.
4. **Brand identity:** retain truthful `WebSite`/`OnlineStore` organization schema already present in `app/layout.tsx`; align verified profiles and external citations with `https://kontamou.site/`. Avoid claiming `kontamou.gr` is owned/controlled by the marketplace.
5. **Diagnosis of original September incident:** use Search Console daily page-query snapshots and Git history/production deployments around Sept 10–12 to isolate whether the visibility collapse was a specific noindex/robots/sitemap/canonical change, a DB/crawler access failure, or an external Search event.
6. **Search Console manual checks:** review Manual Actions, Security Issues, Page Indexing, Crawl Stats and the indexed/not-indexed count trends; these views are not fully represented by the GSC performance APIs.

## Recovery measurement

Track daily (using **settled** Search Console data): web impressions, clicks, impressions by `/vendor/`, `/product/`, `/category/`, `/shop`; inspection verdicts of a *fixed* URL panel, crawler 5xx / timeouts, and sitemap fetch health.

Initial outcome goal: stabilize crawl/HTTP reliability and reclaim a sustained 7-day average of at least **214 web impressions/day** (Sep 1–10 baseline), while building higher-quality exposure to genuine partner, product and editorial pages. This is a goal, not a ranking guarantee. Do not assess success from average position alone.

## Google escalation

Official help: https://developers.google.com/search/help

- Site-specific troubleshooting: https://support.google.com/webmasters/thread/new (signed-in owner submission).
- Potential **indexing bug**: https://support.google.com/webmasters/contact/indexing_issue_form (only when evidence supports persistent incorrect indexing after the site's technical problems are fixed; login required).
- Google generally does not provide a direct support channel for restoring a preferred ranking position or guarantee indexing.

### Draft site-specific support question (publish after technical remediation)

**Title:** Sudden 97.5% Google Search impression decline on 11 September 2026 — indexed homepage and products, ongoing loss of visibility

I manage the verified Search Console property `sc-domain:kontamou.site`, a Greek local-commerce marketplace. Daily Google Web impressions fell from 161 on September 10 to 4 on September 11, 2026, and remained far below the preceding baseline. September 1–10 averaged 214 impressions/day; our 28-day Search Console report through October 6 shows 403 impressions total.

URL Inspection currently reports the homepage and a sample product page as **submitted and indexed**, crawl allowed and canonical selected correctly. The sitemaps are discoverable; however, the sitemap-level indexed count returned via API is 0 while individually inspected URLs are indexed. We identified and are fixing production database contention and a sitemap failover that returned empty HTTP 200 responses during connection failures.

After verifying fixes and collecting crawl/index coverage evidence, which Search Console reports or test URLs best distinguish widespread indexing degradation from a Google-side reporting/serving anomaly? Is there a known Search data or indexing incident around September 11 affecting this pattern?

This request is for technical diagnosis, not manual ranking adjustment.

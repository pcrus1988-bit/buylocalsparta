# Catalogue crawler worker

The KONTAMOU catalogue crawler is a dedicated long-running Node 24 worker. It is intentionally separate from the Vercel web runtime and from the general PostgreSQL, search, notifications, media and reports workers.

## Deployment role

Run the existing worker image with:

```text
BLS_WORKER_ROLE=crawler
```

The crawler requires the platform-runtime `DATABASE_URL` used by the worker tier. Do not expose crawler database credentials, source-control credentials, cloud metadata credentials or other worker secrets to the public web runtime.

## Network safety

The worker only acquires HTTP(S) catalogue evidence. Every target is checked against the crawl profile allowlist before acquisition. DNS answers are validated for public IP space, the selected validated address is pinned into the request lookup, TLS keeps the original hostname through SNI, and every redirect is independently resolved and revalidated. Private, loopback, link-local, reserved and metadata-service targets are rejected.

The current worker uses HTTP acquisition only. Profiles that explicitly require browser acquisition fail closed until the isolated browser adapter is implemented. Response bodies are bounded in memory and are not persisted in the crawl ledger; page evidence stores status, response size/hash, resolved addresses and redirect history.

## Robots, discovery and extraction

`obey_robots` defaults to true. The worker reads `robots.txt`, follows declared and conventional sitemaps, discovers same-policy HTML links and extracts Schema.org/JSON-LD Product evidence. Per-field provenance is retained. Crawl extractions are staging evidence only and never become public products or sellable offers directly.

## Durable queue and crash recovery

Migration 0130 adds lease ownership to `catalog_web_crawl_jobs`. Workers claim with `FOR UPDATE SKIP LOCKED`, renew their lease while processing and release ownership on completion or retry. Expired running leases are reclaimable after a crash. Retry attempts use bounded exponential backoff in the worker.

## Worker configuration

- `BLS_CRAWLER_WORKER_ID`: optional stable opaque worker identifier. Defaults to hostname and process id.
- `BLS_CRAWLER_POLL_MS`: queue poll interval; default `2000`.
- `BLS_CRAWLER_LEASE_SECONDS`: job lease duration, 30–3600; default `300`.
- `BLS_CRAWLER_REQUEST_TIMEOUT_MS`: per-request timeout; default `15000`.
- `BLS_CRAWLER_MAX_ATTEMPTS`: terminal attempt limit, 1–20; default `5`.
- `BLS_CRAWLER_MAX_SITEMAPS`: sitemap documents inspected per job; default `32`.
- `BLS_CRAWLER_RETRY_BASE_SECONDS`: retry backoff base; default `30`.
- `BLS_CRAWLER_USER_AGENT`: crawler user agent. Defaults to `KONTAMOU-CatalogBot/1.0 (+https://kontamou.site/)`.
- `BLS_DB_POOL_MAX`: crawler DB pool default is `4` when not explicitly configured.
- `BLS_DB_IDLE_TIMEOUT_MS`: crawler DB idle timeout default is `30000` when not explicitly configured.

Crawl-profile limits stored in PostgreSQL remain authoritative for allowed hosts, HTTP exceptions, redirects, response bytes, depth, page count and request rate. The worker does not trust a database allowlist alone: network validation is repeated at acquisition time.

## Publication boundary

The worker writes only crawl jobs, page evidence and `catalog_web_product_extractions`. Accepted candidates must later be promoted into the immutable supplier PIM (`catalog_source_*`) and pass the existing taxonomy and canonical-product matching workflows. This is the boundary that prevents a malformed or compromised source crawl from publishing directly into KONTAMOU.

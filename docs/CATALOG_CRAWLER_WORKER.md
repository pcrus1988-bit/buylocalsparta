# Catalogue crawler worker

The KONTAMOU catalogue crawler is a dedicated long-running Node 24 worker. It is intentionally separate from the Vercel web runtime and from the general PostgreSQL, search, notifications, media and reports workers.

## Deployment role

Run the existing worker image as a continuously running service with:

```text
BLS_WORKER_ROLE=crawler
BLS_CRAWLER_HEALTH_PORT=8081
```

The crawler requires the platform-runtime `DATABASE_URL` used by the worker tier. Do not expose crawler database credentials, source-control credentials, cloud metadata credentials or other worker secrets to the public web runtime. Configure the service health probe to request `GET /healthz` on the internal health port. The endpoint returns 200 while the process is healthy and 503 during graceful shutdown; it exposes only worker state, current opaque job id, activity time and schema version.

## Admin control plane

`/admin/catalogue-crawler` is the operator surface. Admins with catalogue permissions can create bounded crawl profiles for existing catalogue sources, queue discovery/full/category/single jobs, request cancellation, inspect worker/lease/heartbeat state and explicitly promote completed crawl evidence into Supplier PIM Intake.

The Admin web process never crawls a supplier website. Queueing writes only a durable job record. A separately deployed crawler worker claims that record with a lease and performs acquisition. Promotion remains a separate explicit operation and does not create vendor offers, inventory or public products.

## Network safety

The worker only acquires HTTP(S) catalogue evidence. Every target is checked against the crawl profile allowlist before acquisition. DNS answers are validated for public IP space, the selected validated address is pinned into the request lookup, TLS keeps the original hostname through SNI, and every redirect is independently resolved and revalidated. Private, loopback, link-local, reserved and metadata-service targets are rejected.

The current worker uses HTTP acquisition only. Profiles that explicitly require browser acquisition fail closed until the isolated browser adapter is implemented. Response bodies are bounded in memory and are not persisted in the crawl ledger; page evidence stores status, response size/hash, resolved addresses and redirect history.

## Robots, discovery and extraction

`obey_robots` defaults to true. The worker reads `robots.txt`, follows declared and conventional sitemaps, discovers same-policy HTML links and extracts Schema.org/JSON-LD Product evidence. Per-field provenance is retained. Crawl extractions are staging evidence only and never become public products or sellable offers directly.

## Durable queue, cancellation and crash recovery

Migration 0130 adds lease ownership to `catalog_web_crawl_jobs`. Workers claim with `FOR UPDATE SKIP LOCKED`, renew their lease while processing and release ownership on completion or retry. Expired running leases are reclaimable after a crash. Retry attempts use bounded exponential backoff in the worker.

Migration 0136 adds cooperative cancellation, worker heartbeats and queue-health reporting. Queued jobs cancel immediately. Running jobs receive a cancellation request that the owning worker acknowledges at its next lease checkpoint, preventing Admin from racing the worker by forcibly stealing its lease. The worker then records a normal `cancelled` terminal state instead of retrying the job.

## Worker configuration

- `BLS_CRAWLER_WORKER_ID`: optional stable opaque worker identifier. Defaults to hostname and process id.
- `BLS_CRAWLER_POLL_MS`: queue poll interval; default `2000`.
- `BLS_CRAWLER_LEASE_SECONDS`: job lease duration, 30–3600; default `300`.
- `BLS_CRAWLER_REQUEST_TIMEOUT_MS`: per-request timeout; default `15000`.
- `BLS_CRAWLER_MAX_ATTEMPTS`: terminal attempt limit, 1–20; default `5`.
- `BLS_CRAWLER_MAX_SITEMAPS`: sitemap documents inspected per job; default `32`.
- `BLS_CRAWLER_RETRY_BASE_SECONDS`: retry backoff base; default `30`.
- `BLS_CRAWLER_USER_AGENT`: crawler user agent. Defaults to `KONTAMOU-CatalogBot/1.0 (+https://kontamou.site/)`.
- `BLS_CRAWLER_HEALTH_PORT`: internal health endpoint port; default `8081`.
- `BLS_DB_POOL_MAX`: crawler DB pool default is `4` when not explicitly configured.
- `BLS_DB_IDLE_TIMEOUT_MS`: crawler DB idle timeout default is `30000` when not explicitly configured.

Crawl-profile limits stored in PostgreSQL remain authoritative for allowed hosts, HTTP exceptions, redirects, response bytes, depth, page count and request rate. The worker does not trust a database allowlist alone: network validation is repeated at acquisition time.

## Operational readiness

A production crawler service is considered ready only when all of the following hold:

1. the database readiness check reports the exact expected schema version;
2. the service health probe can reach `/healthz`;
3. the Admin queue health view shows no persistent expired leases;
4. the worker can claim, renew and complete or cancel fixture jobs;
5. crawler acceptance CI passes without contacting an external supplier website.

## Publication boundary

The worker writes only crawl jobs, page evidence and `catalog_web_product_extractions`. Accepted candidates may be promoted into the immutable supplier PIM (`catalog_source_*`) and must pass the existing taxonomy and canonical-product matching workflows. This boundary prevents a malformed or compromised source crawl from publishing directly into KONTAMOU.

# Nova / BrandsGateway catalogue worker

KONTA MOY ingests Nova/BrandsGateway through a dedicated long-running worker. It must not run as a Vercel request/response function or Vercel Cron job.

## Runtime

Use the standard production worker image at `deploy/worker.Dockerfile` and set:

- `BLS_WORKER_ROLE=nova-catalogue`
- `DATABASE_URL` to the production PostgreSQL connection used by the application worker runtime
- `NOVA_API_KEY` as a server-only secret
- `NOVA_API_BASE_URL=https://nova.shopwoo.com/api/v1`
- optional `BLS_NOVA_WORKER_ID`, `BLS_NOVA_POLL_MS`, `BLS_NOVA_RETRY_MS`, and `NOVA_SYNC_MAX_PAGES_PER_SLICE`

Never expose `NOVA_API_KEY` through `NEXT_PUBLIC_*`, browser bundles, logs, Admin forms, public APIs or source-controlled configuration.

## Supplier contract

The authenticated account resolves Nova store `2` (`BrandsGateway`). Nova is rate-limited to at most 60 requests/minute by the client.

Confirmed commercial price semantics for this account:

- `regular_price` is MSRP/RRP reference price.
- `sale_price` is KONTA MOY's supplier buying cost.
- Neither field is the final KONTA MOY customer selling price. Customer retail remains governed by the structured vendor pricing layer.

Supplier availability is authoritative. Backorders are rejected by default.

## Bootstrap and incremental synchronization

The worker runs resumable bounded slices. Initial bootstrap reads paginated `/products` results in batches of up to 100. Progress is kept under `catalog_sources.metadata.novaSync`; a database lease prevents competing workers from advancing the same cursor simultaneously.

Each fetched product page is stored as new immutable `catalog_source_snapshots` and `catalog_source_products` evidence. Existing evidence is never rewritten. Once bootstrap is complete, the worker cycles through:

1. product changes using `updated_at_min` / `updated_at_max` with a five-minute overlap;
2. deleted-product changes using `deleted_at_min` / `deleted_at_max`;
3. the next product-change window.

A supplier product deletion never deletes a canonical KONTA MOY product. It withdraws matching Nova supplier offers. If Nova later returns the same product/variant ID, a previously active offer can be reactivated from fresh authoritative evidence.

## Publication boundary

Nova ingestion is source/PIM staging only. Imported supplier evidence must **never become public products automatically**. Catalogue matching, taxonomy/category mapping, content quality, Greek localization, pricing and other marketplace quality gates remain separate governed transitions.

During bootstrap, `dropship_suppliers.catalogue_sync_enabled` may be enabled only after the worker is deployed with valid DB and Nova credentials. `order_forwarding_enabled` remains false until the exact Nova order-create request and supplier payment/charging behavior are separately verified.

## Order safety

This worker does not call `POST /orders`. It does not create supplier purchases and cannot change the seller-of-record model. Future order forwarding must remain downstream of confirmed Mollie payment, exact supplier stock revalidation and KONTA MOY fulfilment splitting/idempotency controls.

## Operational checks

Healthy operation should show structured `nova.worker_started` and `nova.catalogue_sync_slice` logs. Production database evidence can be checked by counting Nova `catalog_source_snapshots` / `catalog_source_products` and reading the sanitized `novaSync` cursor. Never log credentials or raw authorization headers.

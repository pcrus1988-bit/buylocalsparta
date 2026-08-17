# Production Search + Transactional Email Runbook — Build 0.40.0

## Purpose

Build 0.40 connects the existing provider-neutral search and notification contracts to concrete production transports without changing Buy Local Sparta's marketplace invariants.

- **Search:** Meilisearch is an external, rebuildable projection. PostgreSQL remains authoritative.
- **Email:** Resend is a transport over the durable PostgreSQL notification queue. PostgreSQL remains authoritative for notification state, attempts, recipient preferences and provider-event deduplication.

Neither provider is a financial or catalog source of truth.

## Meilisearch production boundary

### Indexed data

Only canonical public product documents are indexed. The projection may contain:

- canonical public ID;
- Greek/English public title and description;
- brand/model/public product identifiers;
- public category codes and governed public attributes;
- public platform price;
- aggregate availability/pickup/advice flags.

It must **not** contain hidden Vendor offers, supplier acquisition prices, fairness deficits, competitor exposure statistics, customer identifiers, private Ask Local prices or settlement data.

Customer search is a two-stage flow:

1. Meilisearch selects relevant canonical products.
2. Fair Vendor Exposure runs in BLS only for canonical products actually rendered, selecting the eligible local fulfilment/advice partner.

### Credentials

The web application should receive only:

- `MEILISEARCH_SEARCH_KEY`

The index configuration/reconciliation worker additionally requires:

- `MEILISEARCH_ADMIN_KEY`

Do not expose the admin key to browsers. The browser never calls Meilisearch directly in the prepared architecture.

### Required environment

```text
BLS_SEARCH_ENABLED=true
MEILISEARCH_URL=https://<private-or-approved-search-host>
MEILISEARCH_INDEX_UID=bls_products_v1
MEILISEARCH_SEARCH_KEY=<restricted search key>
MEILISEARCH_ADMIN_KEY=<worker-only index-management key>
MEILISEARCH_TIMEOUT_MS=5000
MEILISEARCH_TASK_TIMEOUT_MS=20000
MEILISEARCH_TASK_POLL_MS=100
BLS_SEARCH_RECONCILE_MS=30000
```

### Deployment order

1. Provision Meilisearch with TLS/network controls.
2. Create a restricted search key and a separate index-management key.
3. Run `npm run search:configure` from a trusted job with the admin key.
4. Start `npm run worker:search` with PostgreSQL + both Meilisearch keys.
5. Enable `BLS_SEARCH_ENABLED=true` in web with the search key.
6. Verify `/api/health/ready` reports search ready.
7. Test Greek, English and Greeklish queries, categories, availability and price sorting.
8. Suppress/recall a canonical product and prove reconciliation removes it from the external index before launch.
9. Kill/recreate the index in staging and prove the PostgreSQL reconciliation worker rebuilds it.

The current worker uses a periodic reconciliation pass plus durable document hashes. Multiple upserts are safe, but production should normally run one active reconciliation worker per index until a distributed worker lease is added for this provider loop.

## Resend transactional email boundary

### Delivery model

The Core notification service creates durable notifications. The external worker leases only `email` rows because Resend is an email-only provider. SMS/push rows are never leased by this worker.

The worker:

1. claims due email notifications using PostgreSQL `FOR UPDATE SKIP LOCKED` leases;
2. resolves a verified active customer/Vendor-owner email at send time;
3. checks privacy-minimised suppression state;
4. sends through Resend with the notification public ID as the provider idempotency key;
5. records the provider message ID and a masked delivery-attempt audit;
6. retries bounded transport errors through the existing durable retry schedule.

Raw destination addresses are not stored in provider-event/suppression audit tables. Suppression uses a stable HMAC of the normalized destination.

### Required environment

```text
BLS_EMAIL_DELIVERY_ENABLED=true
RESEND_API_KEY=<server-only sending key>
RESEND_FROM=Buy Local Sparta <orders@your-verified-domain.gr>
RESEND_REPLY_TO=<optional support address>
RESEND_WEBHOOK_SECRET=whsec_<provider secret>
RESEND_BASE_URL=https://api.resend.com
RESEND_TIMEOUT_MS=8000
BLS_NOTIFICATION_SUPPRESSION_SECRET=<stable random secret >=32 chars>
BLS_NOTIFICATION_WORKER_ID=<stable worker identity>
BLS_NOTIFICATION_POLL_MS=5000
BLS_NOTIFICATION_BATCH_SIZE=50
```

### Webhook

Configure Resend to send events to:

```text
POST https://<public-origin>/api/webhooks/resend
```

The route reads the raw request body before parsing and verifies the Svix signature headers. Provider event IDs are persisted under a unique provider/event key so at-least-once redelivery is idempotent.

Current handling:

- `email.delivered`: provider event recorded;
- `email.failed`: matching sent notification marked failed for operational visibility;
- `email.bounced`: event recorded, recipient suppressed, notification marked failed;
- `email.complained`: event recorded, recipient suppressed, notification marked failed.

Do not automatically unsuppress a bounced/complained recipient. Re-enablement needs an explicit verified operational process.

### Initial required transactional events

When email delivery is enabled, the Viva payment orchestration currently emits:

- `order.payment_confirmed`;
- `order.refund_completed`.

Both also create an in-app notification. Provider disablement does not create an undeliverable email backlog; the in-app notification still exists.

Future operational events should continue through the same durable notification contract rather than calling Resend directly from request handlers.

## Staging acceptance

Before production activation retain evidence for:

### Search
- health endpoint;
- index configuration task succeeds;
- canonical-only indexed payload inspection;
- Greek/English/Greeklish relevance;
- category/attribute filters and price sort;
- recall/compliance removal;
- rebuild after index deletion;
- no supplier/Vendor-private fields in exported index data.

### Email
- verified sending domain and SPF/DKIM status;
- successful payment-confirmation email in staging;
- provider idempotency replay;
- signed webhook verification;
- duplicate webhook no-op;
- bounce suppression;
- complaint suppression;
- worker crash/restart with leased notification recovery;
- no SMS/push retry-count changes while only Resend is deployed.

## Production gates

Do not claim these integrations are live merely because Build 0.40 contains the adapters. Live activation requires real provider credentials, network/TLS configuration and retained staging evidence. Search and email are rebuildable/replaceable integrations; PostgreSQL remains the authoritative marketplace state.

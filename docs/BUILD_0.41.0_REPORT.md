# Buy Local Sparta — Build 0.41.0 Report

**Release:** 0.41.0  
**Focus:** first concrete production courier adapter — BOX NOW locker delivery

## Summary

Build 0.41 connects the existing provider-neutral BLS shipment lifecycle to BOX NOW's Partner API without changing the seller-of-record, payment, Fair Vendor Exposure or multi-Vendor order invariants. Customer payment remains prepaid through the configured PSP. BOX NOW receives only the shipping data needed to create and track the assigned fulfilment.

## Customer shipping flow

- Shipping checkout supports BOX NOW as the concrete initial carrier.
- The customer selects a locker through the provider widget and supplies recipient name/email/phone required for fulfilment.
- The server validates and persists the provider/locker/contact snapshot with the customer order; the browser cannot choose arbitrary internal Vendor/provider state.
- The checkout idempotency fingerprint includes fulfilment mode, locker and recipient contact details so changing the shipping destination/contact creates a distinct checkout intent.

## Vendor/Admin operations

- Admin `/admin/shipping` maps a BLS Vendor location to the corresponding BOX NOW origin/warehouse identifier.
- Vendor `/vendor/shipping` exposes only the Vendor's own shipping fulfilments.
- Vendor can create/reconcile the carrier delivery, open the BOX NOW PDF label and record physical handover.
- Carrier delivery remains provider-confirmed; there is no Vendor action to self-mark a BOX NOW shipment delivered.

## Provider creation idempotency

The fulfilment public ID is used as the stable BOX NOW `orderNumber`. Provider creation state and attempts are durable in PostgreSQL.

If the creation POST has an uncertain outcome, BLS queries BOX NOW parcels by that order number. A shipment already in `creating` or `manual_review` is reconciled first and automatic re-creation is blocked if no authoritative provider result can be found. This avoids creating duplicate provider parcels after timeouts/process crashes or provider order-number conflicts.

## Webhook integrity and ordering

`POST /api/webhooks/boxnow` reads the raw HTTP body before parsing.

The provider adapter verifies `datasignature` as HMAC-SHA256 over the exact raw top-level `data` JSON object. The implementation deliberately does not parse/re-serialize the data before verification. `data.event` is treated as the operational status field.

Provider event IDs are persisted with a unique `(provider, provider_event_id)` constraint. Duplicate deliveries are no-ops. `data.time` is retained in shipment provider state; older/equal events are recorded for audit but cannot regress the current shipment.

Customer PII from the provider webhook is not duplicated into `shipment_provider_events`; the persisted audit payload is restricted to parcel/order/event/location identifiers needed for reconciliation.

Current provider mappings include in-transit/depot/locker-ready, delivered, missing/lost, returned/expired and cancellation states. Customer-visible timeline entries are generated from carrier events.

## Persistence

Migration `0036_boxnow_shipping_bridge.sql` adds:

- `shipping_provider_locations`;
- provider reference/parcel/creation metadata on `shipments`;
- `shipment_provider_attempts`;
- platform-write / Vendor-read RLS policies.

The expected database schema is now **36**.

## Configuration

When `BLS_BOXNOW_ENABLED=true`, deployment requires:

- `BOXNOW_ENVIRONMENT`
- `BOXNOW_API_URL`
- `BOXNOW_CLIENT_ID`
- `BOXNOW_CLIENT_SECRET`
- `BOXNOW_WEBHOOK_SECRET`
- optional `BOXNOW_PARTNER_ID`
- `BOXNOW_REQUEST_TIMEOUT_MS`

The customer map widget is separately controlled by `NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED` and optional public partner ID. The Next.js CSP grants only the BOX NOW widget/map origins when that public feature is enabled.

## Inconsistencies found and fixed during release validation

1. Four new Admin/Vendor shipping API routes were one directory too high in their relative imports. The dependency-free runtime tests did not exercise those Next route imports; the production source scan found and corrected them.
2. Provider creation manual-review state originally still permitted a normal create retry. It now reconciles first and blocks blind recreation when the provider outcome remains unknown.
3. A recreated shipment after a provider cancellation could retain the old `shipment_provider_attempts.shipment_id`. The conflict update now moves the attempt to the current shipment.
4. The checkout idempotency fingerprint initially omitted recipient name. It now changes when the shipping contact name changes.
5. Provider webhook payload persistence originally risked storing an unnecessary duplicate of customer contact fields. Audit persistence is now privacy-minimised.

## Verification performed locally

On the versioned 0.41 source before removing validation shims:

- 210/210 Core tests passed;
- 7/7 Viva tests passed;
- 4/4 AADE myDATA tests passed;
- 3/3 media/ClamAV tests passed;
- 2/2 Meilisearch tests passed;
- 2/2 Resend tests passed;
- 5/5 BOX NOW tests passed;
- 36/36 migrations verified;
- project consistency/security/PostgreSQL/provider gate passed;
- 4/4 development UI syntax checks passed;
- 6/6 structural accessibility checks passed;
- complete dependency-free HTTP marketplace smoke journey passed;
- strict BOX NOW TypeScript passed;
- strict PostgreSQL-runtime TypeScript passed;
- production source scan covered 361 TS/TSX files with zero parse errors and zero broken relative imports.

After all temporary type-resolution shims were removed, the complete `npm run check` suite was rerun on the exact clean source tree and passed.

## External activation gates

No real BOX NOW credentials or network shipment have been used in this execution environment. Before live activation retain evidence for:

- BOX NOW staging OAuth and origin lookup;
- Admin Vendor-location origin mapping;
- customer locker selection;
- delivery creation and order-number conflict/timeout reconciliation;
- PDF label retrieval;
- handover;
- signed webhook validation with the actual staging webhook secret;
- depot/final-destination/delivered events;
- expiry/return/cancellation scenarios;
- GDPR retention review for recipient fulfilment contact data;
- interaction with the final AADE Digital Goods Movement process.

A real Node 24 Next.js build and live PostgreSQL/PostGIS integration smoke remain CI/deployment evidence gates in this local environment.

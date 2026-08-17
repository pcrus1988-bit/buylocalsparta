# BOX NOW Shipping Integration — Build 0.41.0

## Architecture

BOX NOW is the first concrete carrier adapter behind the provider-neutral BLS shipment model. Customer payment remains prepaid through the configured PSP; BOX NOW is used for locker fulfilment, labels and carrier tracking, not for customer payment collection.

The flow is:

1. Customer chooses `shipping` and selects a BOX NOW locker in checkout.
2. BLS stores only the selected locker ID/label plus the recipient contact snapshot required for fulfilment.
3. Admin maps each active Vendor location to its BOX NOW origin/warehouse ID.
4. After payment confirmation and Vendor acceptance, the Vendor creates the BOX NOW shipment.
5. BLS uses the fulfilment public ID as the stable provider `orderNumber`.
6. If the provider create outcome is uncertain, BLS queries parcels by `orderNumber` before any further action. `manual_review` does not blindly create again.
7. Vendor retrieves the PDF label and hands the parcel over.
8. BOX NOW webhooks become the authoritative carrier-delivery source.

## Environment

Required when `BLS_BOXNOW_ENABLED=true`:

- `BOXNOW_ENVIRONMENT=stage|production`
- `BOXNOW_API_URL`
- `BOXNOW_CLIENT_ID`
- `BOXNOW_CLIENT_SECRET`
- `BOXNOW_WEBHOOK_SECRET`
- optional `BOXNOW_PARTNER_ID`
- `BOXNOW_REQUEST_TIMEOUT_MS`

Customer widget:

- `NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED=true`
- optional `NEXT_PUBLIC_BOXNOW_PARTNER_ID`

`BLS_ALLOW_BOXNOW_STAGE_PREVIEW=true` is a preview-only escape hatch; production must otherwise use the production provider environment.

## Webhook integrity and ordering

The webhook route reads the request body as text before parsing. BLS verifies BOX NOW `datasignature` as HMAC-SHA256 over the **exact raw JSON representation of the top-level `data` object**. It then uses `data.event` as the operational event and `data.time` for ordering.

Every provider event ID is persisted uniquely. Duplicate deliveries are no-ops. Older/equal `data.time` updates are stored for audit but cannot regress shipment state.

Operational mappings include:

- `accepted-to-locker`, `in-depot`, `final-destination` → carrier in-transit state; final-destination is exposed in the customer timeline as ready at locker.
- `delivered` → carrier-confirmed delivery and fulfilment/order-line completion.
- `missing` / `lost` → exception/lost state.
- `expired` / `returned` → return state.
- `cancelled` → provider shipment cancellation where it does not conflict with an already delivered/returned parcel.

## Go-live checklist

- Obtain BOX NOW staging credentials and separate webhook secret.
- Map every participating Vendor shipping location to an approved BOX NOW origin ID.
- Verify public HTTPS webhook registration and HMAC against real staging payloads.
- Exercise locker selection, delivery creation, duplicate/conflict reconciliation, PDF label, handover, final-destination, delivery, expiry/return and cancellation.
- Retain provider request/reference/parcel IDs and screenshots/logs as staging evidence.
- Confirm parcel limits, packaging rules, returns and commercial pricing with BOX NOW.
- Confirm GDPR retention for recipient contact snapshots.
- Coordinate carrier movement with the final AADE Digital Goods Movement process before live shipping activation.

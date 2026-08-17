# Courier Integration Runbook — Build 0.41

BOX NOW is the first concrete production carrier adapter. The BLS shipment domain remains provider-neutral so additional Greek carriers can be integrated without changing order/payment/fairness semantics.

For BOX NOW, deployment must configure the Partner API environment/credentials, webhook secret, customer locker widget and an Admin-maintained mapping from every participating Vendor location to its provider origin ID. Customer payments remain prepaid through Viva; the initial BOX NOW request therefore uses the prepaid carrier flow rather than COD.

Operational rules:

- never retry an uncertain delivery-creation POST blindly; reconcile by the stable fulfilment-based provider order number first;
- never trust Vendor self-confirmation for final shipping delivery;
- verify the webhook against the raw `data` object and dedupe its provider event ID;
- order events by the provider parcel-event time, not HTTP arrival time;
- preserve provider references/parcel IDs and customer-visible shipment timeline;
- keep recipient contact data scoped to fulfilment needs and retention policy;
- validate returns/expiry/cancellation and AADE Digital Goods Movement obligations before live activation.

Additional carriers must receive their own provider package, credential boundary, creation-idempotency strategy, signed/idempotent tracking adapter and staging proof. Do not force ACS/ELTA/Speedex or other APIs into the BOX NOW request schema.

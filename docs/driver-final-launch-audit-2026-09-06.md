# Driver final launch audit — 2026-09-06

## Verified

- Driver login and session gate are implemented.
- Daily clock-in now recovers stale shifts from earlier Athens-local dates.
- Driver workspace polls operations every 10 seconds.
- Foreground GPS presence is persisted and was observed in production for the Test driver.
- Dispatcher offers are isolated to active `delivery_assignment_offers` for the signed-in driver.
- Offer accept/decline is server-side, CSRF protected, expiring, and audited.
- Outbound vendor pickup uses a signed QR shown by the driver and scanned by the vendor.
- Customer final-leg activation is separate from pickup completion and enables customer live tracking.
- Customer delivery completion uses a signed customer QR and atomically updates delivery, fulfilment, order-line and order state.
- Return pickup and vendor return receipt use separate signed QR scopes and custody events.
- Pause, resume, end shift and logout paths are implemented.
- No production runtime errors were found for `/api/driver/operations` or `/api/driver/location` in the inspected seven-day window.

## Blocking / launch-relevant findings

### 1. Delivery stop coordinate propagation

Delivery jobs copy address text into stop snapshots but historically did not copy coordinates already stored on `vendor_locations` or `addresses`. The dispatcher rejects jobs without stop coordinates (`stop_coordinates_missing`). Production currently has many vendor locations with coordinates that were therefore not being reused by delivery stops.

Migration `0210_delivery_stop_coordinate_hydration.sql` fixes this by:

- hydrating new/updated stops from source PostGIS coordinates;
- backfilling existing stops where source coordinates are already available;
- preserving any explicit stop-level coordinate correction.

External geocoding remains the fallback for source addresses that themselves have no coordinates.

### 2. Customer saved-address coordinates

The customer address persistence flow currently stores address text but does not itself populate `addresses.coordinates`. Dispatch-time Google geocoding can fill delivery-stop coordinates, but launch readiness depends on the Maps/Geocoding key being configured and permitted in production. This should be made observable in Delivery Control Centre and then moved toward geocoding-on-address-save with dispatch-time fallback.

### 3. Stale active delivery recovery

Production contains evidence that an old in-progress return can remain assigned for a long time. Admin can assign jobs but currently lacks a dedicated audited requeue/cancel/recovery action, and the driver can decline only new offers—not escalate an already active task. Add explicit incident/recovery handling rather than silently auto-cancelling real deliveries.

### 4. Mobile background tracking limitation

The driver web app uses browser `navigator.geolocation.watchPosition`. This is suitable while the PWA/page remains active, but mobile browsers can throttle or suspend JavaScript when backgrounded. Opening an external navigation app can therefore interrupt continuous live tracking. Treat true background tracking as a native/PWA platform capability decision rather than assuming foreground browser tracking is continuous.

## Remaining end-to-end acceptance

Run a clean outbound test job after coordinate/geocoder readiness is confirmed:

1. Driver clocks in and GPS becomes fresh.
2. Dispatcher creates an expiring offer.
3. Driver accepts; route plan is created.
4. Vendor scans the driver's pickup QR.
5. All vendor pickups complete.
6. Driver confirms Final leg.
7. Customer sees live tracking and delivery QR.
8. Driver scans customer QR.
9. Job completes, tracking disables, fulfilment/order state completes.

Then run the return path:

1. Customer presents return-pickup QR.
2. Driver scans and custody moves customer → driver.
3. Vendor presents return-receipt QR.
4. Driver scans and custody moves driver → vendor.
5. Return and delivery job complete.

# Delivery live tracking

KONTA MOU delivery tracking is designed so GPS sharing exists only for an assigned, active delivery job.

## Runtime flow

1. The driver explicitly starts live tracking in `/driver`.
2. The browser Geolocation API sends authenticated GPS pings to `/api/driver/location`.
3. The customer delivery workspace reads a lightweight location snapshot every five seconds while the page is open.
4. The full order/return progress refresh remains separate so GPS reads do not resynchronise the whole delivery job graph.
5. When the driver stops tracking, logs out, is suspended, or the job is completed, customer live-location rendering stops.
6. GPS pings retain the existing 30-day expiry policy.

The embedded map works with the existing Leaflet/OpenStreetMap fallback and does not require a Google key.

## Optional Google Maps + traffic ETA

Google integration is intentionally progressive and customer-initiated. The customer must press **Google Maps + ETA** before Google browser assets or Google route calculations are requested.

Configure these Vercel environment variables:

```text
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_ROUTES_API_KEY=
```

`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` is intentionally public and must be restricted in Google Cloud to the KONTA MOU web origins/referrers and to the Maps JavaScript API.

`GOOGLE_MAPS_ROUTES_API_KEY` is server-only. Restrict it to the Routes API and never expose it through `NEXT_PUBLIC_*`.

For backward compatibility the server routing adapter also accepts `GOOGLE_MAPS_API_KEY`, but the dedicated `GOOGLE_MAPS_ROUTES_API_KEY` is preferred.

Enable the Maps JavaScript API and Routes API in the Google Cloud project attached to the keys. Billing and quotas are controlled in Google Cloud.

## Multi-stop ETA semantics

For outbound orders, the traffic-aware route includes all still-open vendor pickup stops, in delivery sequence, before the final customer drop-off. The ETA therefore represents the remaining delivery route rather than a misleading direct driver-to-customer estimate.

For returns:
- before customer pickup, ETA means driver arrival at the customer;
- after customer pickup, ETA means completion of the remaining vendor return route.

The route/ETA refresh interval is 45 seconds to avoid unnecessary Google API requests. Driver position refresh is independent at five seconds.

## Privacy

Exact customer addresses stay server-side. The live-location endpoint returns only the authenticated customer's assigned job and the latest driver GPS point. The Google Routes adapter sends only the route waypoints required to calculate the selected customer's route, and only after the customer opts into Google Maps + ETA.

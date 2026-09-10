# HUB expansion merchant onboarding

`/hubs/join` intentionally follows the same registry-first pattern as `/join`.

## Public flow

1. Vendor enters a Greek AFM.
2. Server validates the AFM and resolves the company through Γ.Ε.ΜΗ. OpenData.
3. The Γ.Ε.ΜΗ. postcode is mandatory evidence for HUB routing.
4. If the registry city unambiguously names one governed HUB, that HUB is selected.
5. Otherwise the full registry address + postcode is geocoded server-side and matched to the nearest eligible HUB inside its governed radius.
6. If the resolved HUB is Sparta, the vendor is redirected to the existing `/join/apply` flow.
7. For expansion HUBs the vendor chooses a plan and supplies only missing commercial/contact information.
8. On final submission the backend repeats AFM → Γ.Ε.ΜΗ. → location → HUB. The browser never supplies the authoritative HUB id.

## Required runtime configuration

Γ.Ε.ΜΗ. uses the existing server-only `GEMI_OPENDATA_API_KEY` runtime.

For vendors whose Γ.Ε.ΜΗ. city does not directly identify a HUB, configure a dedicated server-side Google Maps Geocoding key:

```text
GOOGLE_MAPS_GEOCODING_SERVER_KEY=
GOOGLE_MAPS_GEOCODING_TIMEOUT_MS=6000
```

Enable the Google Geocoding API for the key and restrict it to the required API. Do not expose this key through `NEXT_PUBLIC_*` variables.

If a location cannot be resolved safely, the application is not assigned to an arbitrary HUB and must not continue as a normal prospect submission.

## Data integrity

`hub_expansion_prospects` stores the AFM, Γ.Ε.ΜΗ. number, registry check timestamp, registry address/postcode and HUB-resolution evidence. An open prospect is unique by AFM. Sparta (`KM-HUB-015`) remains blocked from this table.

# GEMI business-level GEO assignment gate

The private `scripts/assign-hub-gemi-census.ts` program originally selected any licensed point attached to a shared `location_key`, including postcode or locality centroids, and could assign every business using that point to a HUB. Even though migration 0444 separately prevented publication, that would pollute the underlying HUB assignment status with unverified inferences.

The script now requires all of the following before assigning a business, even **privately**:

- Geolocation precision `address` with an eligible, licensed/verified source.
- Traceable source reference of at least 12 characters matching the manually reviewed **business-level** address evidence reference.
- Evidence type `verified_premise_address` or `verified_registry_address` with populated verified street address.
- Separate physical-geography verification timestamp, human review timestamp and reviewer identifier.
- An exact five-digit postcode match between GEMI and the coordinate source.
- A `location_key` used by exactly **one** GEMI business in the private directory. Shared postcodes, neighborhoods or geocoder buckets require manual individual-address adjudication.
- Verified mainland vs island context and the existing 131-HUB deterministic 25-km resolver.
- Re-validation of the principal constraints in the SQL `UPDATE` transaction to prevent stale evidence from silently assigning a record.

All assignments still leave `display_status='unpublished'`, `seo_approved=false` and all privacy/editorial publication requirements untouched. An automatic geographic result never satisfies the `assignment_method='manual_geo_review'` condition needed by migration 0444 to publish.

Operations: dry-run without `--apply`; `--apply` additionally requires `KM_GEMI_HUB_ASSIGNMENT_APPROVED=true`. Never set this flag to bulk-assign postcode centroids. Run `npm run test:hub-gemi-assignment` and check read-only rollout audit before any production batch.

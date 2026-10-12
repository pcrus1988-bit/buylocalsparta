# National GEMI → 131 KONTA MOY HUB business census

## Production staging verified 12 October 2026

- Research frame: 567,206 rows, 313,933 distinct GEMI references across two snapshots.
- Deduplicated, named entities staged: 313,911 private records.
- Location key inventory: 26,166 combinations of postcode, city, municipality and prefecture; none yet has stored coordinate evidence.
- The 131 official HUB master points are versioned in the database and the repository. Coverage defaults to a hard 25 km radius, with explicit island handling.
- All new records default to unpublished and noindex, without a vendor login, a commerce relationship, or proof of operating status.

## 12 October geographic source audit and publication integrity

Business-level location verification is a **hard prerequisite** for national GEMI census publication. The staged snapshot has 313,911 businesses, 26,166 location keys, 24,285 keys with valid 5-digit postcodes, and 1,918 distinct postcodes. The 104 municipality-name proposals are **not** business points; 16 of the 104 have municipality centres more than 25 km from their nearest proposed hub and two also cross region boundaries. These are automated **triage flags**, not a rejection of the individual businesses.

Migration `0444_hub_gemi_business_address_publication_gate.sql` adds a database-enforced, fail-closed publication gate. Census publication requires verified business-level address text and provenance, real address coordinates within 25 km of a single eligible hub, the manual geographic-review assignment method, a recent source-check record, an independently documented privacy and editorial review, and named reviewers. Existing postcode and municipality geocoding remains usable **only** as private advisory evidence. No ZIP centroid, municipal centre, or assumed island ID can satisfy the publication gate. `seo_approved` remains separate.

A reproducible no-secrets CI audit can download the licensed [Eurostat GISCO 2025 postcode point GeoJSON](https://gisco-services.ec.europa.eu/distribution/v2/pcode/geojson/PCODE_PT_2025_4326.geojson), extract only the Greek postcode points and produce review-only hub-proximity suggestions using `scripts/gemi-postcode-point-review.ts`. It never reads GEMI records, sets business coordinates, assigns hubs, or publishes pages. Attribution: © European Union - GISCO, 2024, postal code point dataset, CC-BY-SA-4.0. GISCO explicitly warns that points may be missing/inaccurate. The source is **not** sufficient for business address verification.

The private admin review page flags cross-region municipality matches and municipality-centre distances over 25 km. These prompts guide independent verification; reviewing a municipality name does not certify the location of a business. No automatic human-review acknowledgements are generated.

Rollout order: obtain address-level evidence with lawful commercial retention, verify physical location and island, check GEMI legal status and privacy/public-interest basis, ensure canonical deduplication with converted CLAIM/vendor pages, secure independent editorial moderation, then publish a bounded informational `noindex` pilot and inspect logs. Only selected high-quality, independently SEO-approved pages should become indexable. Do not create a 313k-page sitemap automatically.

## Geographic assignment

Do not substitute the centre of a municipality for a real business location. Obtain licensed and storage-permitted geocode coordinates once per location key, with source_reference, precision_kind and island_group. The source research does not contain latitude/longitude or precise street addresses, so postcode-level assignment remains approximate near boundaries. An address-based second pass is needed for edge cases.

Geocode import scripts/import-hub-gemi-geocodes.ts accepts NDJSON with location_key, latitude, longitude, geo_source, precision_kind, source_reference, and island_group. It dry-runs by default, and requires KM_GEMI_GEOCODE_IMPORT_APPROVED=true and --apply to write. Never persist externally geocoded coordinates in violation of provider license.

Assignment scripts/assign-hub-gemi-census.ts reads only geocoded keys and assigns to the nearest eligible hub within 25 km; specific verified island hub IDs preserve landmass restrictions. Outside radius is classified outside_coverage and never published as local. No mainland/island evidence means no assignment. It dry-runs by default and requires KM_GEMI_HUB_ASSIGNMENT_APPROVED=true and --apply for updates.

One GEMI registration means one canonical legal entity. Multiple physical branches require a separate physical-location business graph rather than duplicating the company.

## Implementation continuation — guarded matching and import safety

- The municipality matcher now recognizes a conservative set of common Greek genitive endings against the pinned licensed municipal-centre dataset. Exact matches take precedence; ambiguous matches fail closed. These remain **review-only candidates**, not business point coordinates or publishable HUB assignments.
- An island hub identifier is not sufficient to bypass the 25-km boundary, even for a `WHOLE_ISLAND` hub. Contradictory mainland/island evidence is refused. A true whole-island exception would need separately verified island geometry, not merely a supplied HUB identifier.
- Evidence imports refuse island points outside the nominated island HUB's 25-km radius. Existing manually verified geocodes and location keys backing published census businesses are protected against automatic overwrite.
- Automatic assignment skips published records and manually reviewed assignments. Category counts and index-readiness thresholds exclude entries converted into approved owner-linked CLAIM profiles.
- Approved CLAIM business search is applied in SQL *before* the limit, so a result does not disappear simply because it was outside the first page.
- The directory remains unpublished and noindex until per-business geographic verification and privacy/editorial review are complete. Merely improving municipality matching does **not** increase the number of public businesses.
- Regression tests: `npm run test:hub-gemi-assignment`.

## Administrative municipality-name review — migration 0443

- `/admin/hubs/gemi-directory` supports an explicitly authenticated, CSRF-protected, permission-checked decision on a single proposed municipality name match, with a 20–600 character explanation and mandatory municipality-only attestation.
- The database changes only `review_status` from `proposed` to `reviewed` or `rejected` in a transaction that also creates an append-only review event containing reviewer ID, gazetteer reference, rationale and decision.
- Reviewed refers **only** to the administrative-name equivalence. It is never permission to copy municipal centroid coordinates into businesses, mark businesses inside 25 km, or publish/index their records.
- The matcher now preserves `normalized_genitive_variant` provenance distinctly from exact transliteration. Rejected/reviewed suggestions are protected from automated overwrite.
- Migration 0443 needs explicit production rollout and checksum-ledger verification before deploying the new runtime schema gate (443). The migration does not modify, geocode, assign, publish or index businesses.
- Do not run the municipality matching script with `--apply` until 0443 is installed and a fresh dry-run has been reviewed. Never use municipal centroids as business-level geocoding evidence.

## Licensed geography collection worklist

Use `scripts/export-hub-gemi-geocode-worklist.ts --limit=500` against the private
database, redirecting stdout to a nonpublic NDJSON file. Pagination uses
`--after=<lastLocationKey>`. Default scope requires a five-digit postcode;
`--include-incomplete` includes the incomplete records for separate manual research.
The output contains location hashes, postcode, city, municipality, prefecture and an
aggregate business count — no individual GEMI/company identities, telephone numbers,
emails, AFMs or research answers. It never assigns a HUB or publishes a page.
Geocoding still requires location-level source evidence, the legal right to retain
the coordinates, mainland/island verification, and individual review near radius
boundaries. Do not upload the private worklist to a third-party service without an
approved data-processing and licensing assessment.

## National listing → all HUB subscriptions (12 October 2026)

- The researched/unclaimed business presentation reuses the Sparta invited-vendor distinction between informational directory records and verified commercial partners. A public GEMI record is **not** proof an invitation was sent; invitation delivery belongs in the private outreach/audit system.
- Any published, geographically verified GEMI business can now open its existing page and choose **CLAIM, PRESENCE, SHOP, GROWTH, or PRO**. The same `gemi` URL context survives switching plan, billing cycle, and authentication.
- The browser submits a `listingGemi` reference for *any* selected plan; server-side application creation re-resolves AFM → GEMI → HUB and requires an exact matching published, assigned census record. Forged or mismatched references fail; the page itself does not confer ownership.
- The existing `claim_application_id` foreign key currently links a census record to the first pending subscription application regardless of plan (legacy column name). Any later schema rename must preserve historical referrals. There is no automatic commercial activation.
- For paid plans, user authentication is still required to start the private three-day trial; the login return path retains GEMI and billing choices. The free CLAIM procedure remains separately moderated.
- Already owner-verified CLAIM listings may also enter PRESENCE, SHOP, GROWTH or PRO from their public profile, carrying forward their GEMI identity. The existing CLAIM listing remains untouched while a new paid application is reviewed.
- Keep only one canonical researched-business URL per legal GEMI entity, with a stable slug and a verified HUB assignment. Preserve existing owner-linked CLAIM redirects and prevent duplicate census/CLAIM cards. Paid activated storefront canonicalization remains a separate task pending its activation schema contract.
- No mass publication is authorized by these UI/onboarding changes. Permit only individually quality-reviewed entries with licensed geocode/address evidence and explicit SEO approval; no automated invitations or billing.
- Tests: `node --experimental-strip-types --test apps/web/src/lib/hub-gemi-join-links.test.ts`.

## New public routes (application code implemented; publication governed)

- /hubs/volos/business: paginated, searchable research directory alongside approved CLAIM business pages.
- /hubs/volos/business/<slug>: unclaimed informational profile (no checkout), registry identity and correction/any-plan joining actions.
- /hubs/join/apply?plan=<claim|presence|shop|growth|pro>&gemi=<registration>: reuse AFM-first onboarding; server rechecks official GEMI number, verified HUB and a published census target. A pending application does not grant vendor ownership.
- On converted, owner-linked CLAIM, the census link redirects to the canonical approved CLAIM slug and does not duplicate directory results.
- The legacy Sparta /shops and /vendor/<slug> routes remain intact.

## SEO / GSC

Publish only after geographic, factual, regulatory and privacy quality checks. Business status must not imply trading or verification. Individual research URLs stay noindex unless SEO approval is explicitly recorded. The hub directory stays noindex until substantial locally relevant content passes admission. GSC metrics may inform headings, descriptions and priority after discovery, but GSC is not a source of business verification. Do not inject all census rows into a sitemap or turn them into 300k thin pages.

## Separation / acceptance checks

Keep contact vault, study sample, survey responses, suppressions, email and personal recruitment details outside the hub directory. RLS permits application runtime to read only published and assigned private census rows, never all rows or hidden contacts. Existing CLAIM pages maintain their separate owner verification and moderation rules. Migration 0440 includes the immutable hub geographic master and private data model, together with role ACLs and RLS.

Tests: node --experimental-strip-types --test apps/web/src/lib/hub-gemi-assignment.test.ts

Outstanding: permitted geocodes, assignment batches, boundary review, operator review interface, directory page publication, GSC-led SEO tuning, sitemap governance and deployment.

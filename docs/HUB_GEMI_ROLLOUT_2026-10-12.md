# National HUB and GEMI directory — publication and activation runbook

Baseline: 12 October 2026 (live read-only production audit). All database quantities below are snapshots, not automatic release targets.

## Separate statuses, never collapse them

1. **Marketplace live:** a HUB with an operational market binding, gateway visibility, shopping, and checkout. Sparta is the legacy active marketplace. CLAIM alone must never activate shopping.
2. **Verified public directory:** at least one approved and owner-accepted CLAIM registration with `plan_code='claim'`, `status='converted'`, a verified owner and a canonical `public_slug`. Volos/HostChefs is the first observed example. A directory may be active while marketplace controls remain off.
3. **Unclaimed GEMI information:** independent, non-partner informational listings that pass location, legal/privacy, editorial and publication gates. A research import, a municipality centroid, or a registered business name does **not** make a listing publishable.
4. **Prospect/preparing/planned:** no public verified businesses; do not present placeholder HUBs as active or indexable.

## Snapshot of operational backlog

- 131 HUBs in `public.expansion_hubs`: 1 live (Sparta), 17 prospect, 113 inactive.
- `public.vendor_businesses`: 2 active Sparta vendors, 349 invited publicly visible, plus non-active application records.
- `public.hub_expansion_prospects`: 1 converted CLAIM (HostChefs, Volos) with an owner and canonical slug.
- `research_private.hub_gemi_directory`: 313,911 rows and 313,911 slugs. All rows awaiting geocode, unassigned, unpublished and SEO unapproved. All privacy reviews pending.
- 305,060 directory entries have registry municipality IDs; this is administrative context, **not** address verification.
- 26,166 `hub_gemi_geo_keys` entries currently lack verified geometry/source precision.
- 104 municipality-name matches are **proposed**; they correspond to approximately 101,182 businesses but only establish potential administrative matching, not the business location.
- `hub_gemi_census_candidates`: 11,786 pending review, none approved for publication.
- No national GEMI records should be mass-published on this basis.

## Deployment in this change

- Treat a verified owner-accepted CLAIM business as sufficient to index its unfiltered HUB directory. Previously Volos directory remained noindex despite indexable HostChefs and Volos landing pages.
- Keep all search, category and pagination combinations noindex/follow; do not index empty HUB directories.
- Represent Sparta's existing active marketplace on `/hubs/sparti` and link `/hubs/sparti/business` to `/shops` to prevent a misleading empty-market interpretation.
- Make the national geographic status visible on demand at `/admin/hubs/gemi-directory?audit=1`, gated by admin session and permission. Audit is SELECT-only to avoid accidental mass changes and unnecessary full-table scans for normal admin navigation.

## GEO verification — safe rollout sequence

1. Review administrative **name** correspondence in `hub_gemi_municipality_matches` and retain reviewer ID, source, reason and status events. It is **not** automatic HUB assignment.
2. Gather lawful, evidenced **physical business address** geometry. Verify each source URL or official reference, precision kind, freshness, postcode, address match, and island/landmass. Never assume coordinates from the municipality centroid are the actual premises.
3. Resolve against the exact 131 HUB master records and 25-km coverage constraints. Reject invalid coordinates, mainland/island contradictions and ambiguous multiple HUB candidates; send them for manual adjudication instead of nearest-city guessing.
4. Record verified coordinate evidence, assigned hub, distance and assignment method in research-private fields, with idempotent and auditable changes. Preserve canonical GEMI ID and unique slug per HUB; collision handling must not expose arbitrary numeric/internal IDs.
5. Independently complete privacy, editorial and legality reviews and decide `display_status='published'` only on eligible records. `seo_approved` requires separate evidence/content quality review and must not be inferred from publication.
6. Roll out per HUB in small reviewed batches, compare counts and canonical routes, check claim-to-directory deduplication and permanent redirects; sample HTML/robots responses from public pages. Avoid mass sitemap submission or claiming active commercial partnerships.

## Validation

- `npm run test:hub-gemi-assignment` (includes `public-hub-availability.test.ts`).
- `npm --workspace @buy-local-sparta/web run build`.
- Verify `/hubs/volos`, `/hubs/volos/business`, `/hubs/volos/business/hostchefs` are indexable only in their unfiltered canonical form.
- Verify `/hubs/sparti` shows active marketplace links, while `/shops` remains the original operational Sparta directory.
- Verify `/hubs/patra` and empty directories remain noindex until they have eligible listings.
- Verify research_private unassigned rows remain unpublished and cannot be retrieved through `listPublicHubCensus`.
- Review analytics, crawler response latency, claim and seller ownership boundaries, RLS / private-schema permissions before any national release.

> Warning: A batch of 313,911 research rows without geocoded physical evidence, privacy review and human editorial checks is **not** ready for public publication. Never set all `display_status` or `seo_approved` values to true merely to fill HUB pages.

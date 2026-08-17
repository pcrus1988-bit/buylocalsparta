# Buy Local Sparta — Build 0.45.0 Report

## Release summary

Build 0.45.0 closes the merchant-visual gap left by Build 0.44 while preserving the existing media, trust and Fair Vendor Exposure boundaries.

Public merchant photography is now used on `/shops` and `/vendor/[id]` only when a published Vendor-approved merchant story explicitly references an eligible same-Vendor media asset. If no governed photo is available, the existing generated merchant artwork/initial remains the public fallback.

The release also adds the supported Admin association workflow in `/admin/content`, eliminating the need for direct SQL to set or remove `merchant_stories.og_image`.

No database migration is required.

## Public storefront behavior

### `/shops`

- Prefers `vendor.story.mediaUrl` when governed photography is available.
- Renders the approved photo inside the existing merchant visual frame with safe cover-cropping and legible overlay treatment.
- Preserves the generated merchant initial/visual identity when no approved photo exists.
- Merchant-directory visibility still does not create or alter Fair Vendor Exposure events.

### `/vendor/[id]`

- Uses the same governed merchant photography in the public Vendor portrait.
- Keeps the generated initial as the fallback.
- Continues to project canonical products through the non-fairness Vendor catalog view; supplier offers/prices remain private.

### Public media stream

`/api/media/[id]` independently revalidates merchant-story eligibility on every read. Public streaming requires:

1. active Vendor in the Sparta market;
2. published merchant story;
3. recorded Vendor approval;
4. publication time reached;
5. `merchant_stories.og_image` references the requested media record;
6. same-Vendor media ownership;
7. `canonical_variant_id IS NULL` so merchant/story media cannot be confused with canonical product media;
8. image kind and supported JPEG/PNG/WebP MIME type;
9. malware scan status `clean`;
10. rights status `approved`;
11. moderation status `approved`;
12. verified private object metadata still matching the reviewed record.

Changing any of these states removes public eligibility without relying on a stale public URL cache.

## Admin merchant-media association

Admin `/admin/content` now includes a merchant-story image selector.

The selector lists only media belonging to the same Vendor as the story that are:

- not assigned to a canonical product;
- supported public image types;
- malware-clean;
- rights-approved;
- moderation-approved;
- backed by a verified private object.

The mutation:

- requires an authenticated platform session;
- requires `content.write`;
- requires the session CSRF token;
- is PostgreSQL-backed only;
- runs in a serializable transaction;
- re-checks Vendor ownership and every media-governance condition server-side rather than trusting the dropdown;
- records attach/remove through the canonical Admin audit service using `merchant_story.media_changed`.

Selecting the empty option removes the association and immediately restores the generated storefront fallback.

Database-less preview mode deliberately does not persist real merchant-media associations.

## Governance and privacy boundaries preserved

Build 0.45 does not:

- scrape or automatically import merchant photos from public websites;
- publish arbitrary Vendor uploads;
- bypass malware scanning, rights approval or moderation;
- expose hidden Vendor offers or supplier purchase prices;
- couple photography/editorial choices to Fair Vendor Exposure;
- change the customer seller-of-record model;
- change product-media governance;
- require a schema migration.

## Regression protection

`npm run check:merchants` now verifies:

- active Vendor/public merchant-story boundaries;
- recorded Vendor approval and publication timing;
- same-Vendor story-media ownership;
- non-product media scope;
- malware/rights/moderation approval;
- independent public-media revalidation;
- generated-art fallbacks on `/shops` and `/vendor/[id]`;
- absence of Fair Vendor Exposure mutations in merchant-directory projections;
- Admin `content.write` + CSRF enforcement;
- serializable Admin association;
- canonical Admin audit action;
- explicit association removal/fallback restoration.

## Production verification

Before release versioning, the complete feature candidate passed the repository's **Production CI** against Node 24, including:

- dependency installation;
- dependency-free marketplace/runtime suite;
- Core and all provider adapter typechecks;
- object-storage and media-processing typechecks;
- PostgreSQL runtime and live DB smoke typechecks;
- staging activation tooling typecheck;
- fresh PostgreSQL 18 + PostGIS migrations;
- database readiness;
- cross-instance live database integration smoke;
- long-running worker typechecks;
- production worker-container build;
- real Next.js production build.

The versioned release branch is accepted only after the same Production CI passes again on the exact final 0.45.0 head. No further release edits should occur after that acceptance run.

## Build identity

Release-scoped application/provider workspaces are aligned to **0.45.0**. The Core domain package intentionally remains at its stable internal API version **0.24.0**.

The latest schema remains migration **0037_activation_evidence.sql**; Build 0.45 adds no migration.

## Remaining activation work

The feature is code/deployment-build complete, but real storefront photography still depends on real content onboarding:

1. Vendor uploads a merchant/story image through the private S3-compatible media pipeline.
2. Automated ClamAV scan completes successfully.
3. Rights provenance is reviewed and approved.
4. Moderation is approved.
5. The Vendor approves/publishes the relevant merchant story.
6. Admin selects the approved image for that story in `/admin/content`.
7. Staging verifies `/shops`, `/vendor/[id]` and revocation/fallback behavior using the real object store.

Provider/live activation remains evidence-gated separately for Viva, BOX NOW, Meilisearch, Resend, object storage/ClamAV and AADE myDATA.

# GEMI official-address evidence bridge — 12 October 2026

## Background
313,911 GEMI research entities are staged but none has verified premises-level coordinates.
306,001 have five-digit postcodes; postcodes and municipality centroids never authorize physical HUB assignments.
The existing official GEMI runtime (apps/web/src/lib/gemi-runtime.ts) already caches street, number and postcode in public.gemi_company_lookup_cache. Do not bulk-call the provider; the application's own limiter is 3 requests per minute.

## Live private pilot
Three new official-registry source records were inserted on 12 October 2026 from recent, unexpired official cache entries, matched to exact GEMI identity and postcode. Active marketplace vendors and already-converted claimed businesses were excluded. Production now has eight address-source evidence rows covering six businesses.
All new rows remain pending/unverified with zero manual confirmations, zero coordinates, zero GEO assignments and zero publications. Existing source evidence and public business pages were not changed.

## Repeatable staging
Dry run:
    POSTGRES_URL=... node --experimental-strip-types scripts/stage-hub-gemi-official-cache-evidence.ts --limit=25

Controlled insert:
    KM_GEMI_OFFICIAL_CACHE_STAGE_APPROVED=true POSTGRES_URL=... node --experimental-strip-types scripts/stage-hub-gemi-official-cache-evidence.ts --apply --limit=25

Continue with --after=123456789 if needed. Batch size is capped at 100. This only reads the existing official cache and inserts private unverified evidence for unpublished, awaiting-geocode GEMI records with an exact postcode match. It refuses unapproved writes, emits aggregate statistics only, preserves all existing evidence via ON CONFLICT DO NOTHING, and never touches assignment, approval, ownership, sales or SEO.

## Release gates
1. Acquire official street-level business addresses with source attribution; provider credentials and quotas must remain protected.
2. Obtain independently verified premises coordinates, source-use rights and matching registered postcode/address; never use a postcode or municipality centroid as the premises.
3. Verify island/landmass and original 25-km HUB coverage, deduplicate active partner profiles and record review provenance.
4. Independently perform legal/privacy, editorial and SEO review before publication; nothing about this bridge grants those approvals.

## Read-only production checks
    SELECT count(*) AS rows, count(distinct gemi_number) AS businesses FROM research_private.hub_gemi_address_source_evidence;
    SELECT count(*) FILTER (WHERE assignment_status='assigned') AS assigned, count(*) FILTER (WHERE display_status='published') AS published, count(*) FILTER (WHERE seo_approved) AS seo FROM research_private.hub_gemi_directory;

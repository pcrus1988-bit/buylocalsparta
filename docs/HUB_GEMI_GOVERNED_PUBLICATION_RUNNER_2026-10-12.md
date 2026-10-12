# HUB GEMI — controlled reviewed-only directory publication (12 Oct 2026)

## Purpose
Add a bounded, keyset-resumable dry-run and release command for municipality-level GEMI entries that ALREADY have independently recorded registry, privacy, editorial and SEO approvals. A reviewed municipality mapping or owner authorization for administrative checks does NOT constitute publication permission.

Migration 0447 database constraints and its publication trigger remain authoritative. The runner does not generate, backdate or impersonate privacy/editorial sign-offs; geocode; create owners; or activate subscriptions.

## Usage

Dry-run by default:

    POSTGRES_URL=... node --experimental-strip-types scripts/publish-reviewed-hub-gemi-directory.ts --hub=volos --limit=100

Reviewed-only release:

    KM_GEMI_REVIEWED_PUBLICATION_APPROVED=true POSTGRES_URL=... node --experimental-strip-types scripts/publish-reviewed-hub-gemi-directory.ts --hub=volos --limit=100 --apply

Return value lastGemi can be used in a later --after=12345678 run. Restart without the cursor to include subsequently approved records. Default 100, maximum 500 per transaction. CLI authorization does NOT waive database-row approvals.

## Qualification gates
Every candidate must already have:
- a municipality classification mapped to a reviewed municipality/HUB pair inside the administrative radius, without asserting an exact 25 km business location;
- recent registry identity evidence (30 days) and checked source (90 days);
- privacy approval with recorded reviewer and timestamp; independently recorded editorial reviewer, timestamp and publication evidence note; explicit SEO approval;
- a safe public slug, a nonempty legal name and no active vendor or converted CLAIM duplicate.

The write modifies only display_status and updated_at. Existing independent approvals and source evidence remain attached to each row. Publication constraints and the trigger run again. The command prints aggregate counts, HUB and a GEMI cursor but no research contacts, addresses or reviewer evidence.

## Production acceptance
1. Run npm run test:hub-gemi-assignment (the suite includes publication policy tests).
2. Confirm migration 0447 and authoritative data sources. Independently review lawful publication especially for sole traders and personally identifying records.
3. Run a dry-run for one HUB and compare with private review queues. A no-op is expected when no entries have cleared legal, editorial and SEO gates.
4. Execute a small approved batch, then check rendered public pages, robots indexing, canonical links, and active-vendor suppression.
5. Record the execution and outcome in the operator change log. Treat all public GEMI pages as informational, not active sellers.
6. Confirm production database and deployed Vercel separately before describing any national rollout as live.

The script publishes only municipality-basis entries. Exact business geocoding and marketplace merchant activation remain separate. A failing transaction rolls back.

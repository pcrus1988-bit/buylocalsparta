# Owner-authorized administrative GEMI review (12 Oct 2026)

## Authorization and limits

The KONTA MOY project owner authorized streamlined internal HUB/GEMI review on 12 October 2026. This is **not** authorization from any listed business, consent to publish personal data, confirmation of exact business addresses, geocoding rights, or evidence of legal/privacy approval.

Automated steps may only clear deterministic administrative **municipality name correspondence** with immutable event provenance. The existing physical-premise checks, island/landmass validation, 25-km business-level radius, manual geographic evidence, legal/privacy review, editorial quality and SEO publication constraints remain unchanged.

No automated script can impersonate a human reviewer: every decision uses actor `automation:owner-authorized:20261012`, and the admin UI distinguishes those decisions from individually reviewed municipal names.

## Production snapshot after approved administrative batches

- 104 municipality-name proposals in the source table.
- 12 individually reviewed earlier, 54 exact owner-authorized automated checks, 20 safe unique genitive-variant automated checks = **86 reviewed**.
- 18 remaining proposed (out of radius, contradictory source region, island-crossing concern, or other ambiguity).
- The 86 administratively reviewed municipalities contain **97,208 provisional research records across 60 nearest-centre HUB candidates**.
- **Zero** records have a validated individual business coordinate, a confirmed 25-km physical assignment, privacy approval, or public GEMI listing.
- Automated name reviews are strictly related to administrative correspondence. A municipality centre does not prove a business is within the same 25-km coverage circle.

## Repeatable workflow

Run a private dry run:

```sh
POSTGRES_URL=... node --experimental-strip-types scripts/auto-review-hub-gemi-municipality-names.ts --limit=200
```

For a bounded owner-authorized write (no business-level changes):

```sh
KM_GEMI_NAME_AUTO_REVIEW_OWNER_APPROVED=true POSTGRES_URL=... node --experimental-strip-types scripts/auto-review-hub-gemi-municipality-names.ts --apply --limit=200
```

The tool requires exactly one gazetteer municipality source match, a supported name-matching method, valid IDs, exact translation of the Greek region name to the HUB region code, and a municipality-centroid separation <=25 km. Source labels with known ambiguous island-crossing HUB geography (`Spetses`, `Agkistri`, `Agathonisi`) cannot pass automatically. Unknown region, missing HUB, missing source, stale decision, conflicting source mapping, out-of-radius or unsupported match method all fail closed. Source candidates are rechecked inside the atomic UPDATE+audit SQL; the audit record identifies automation, not a human.

This script does not assign even a provisional `assigned_hub_slug` to a GEMI business and does not update `display_status` or `seo_approved`.

## Admin visibility

- `/admin/hubs/gemi-directory`: review-status counts and per-row display of automated versus individually reviewed administrative matches.
- `/admin/hubs/gemi-directory/preliminary`: PRIVATE indicative counts for 131 HUBs; this is an approximate classification for workforce planning, not a published business directory.
- `/admin/hubs/gemi-directory/worklist`: unresolved geocoding worklist.
- `/admin/hubs/gemi-directory/evidence`: individual source evidence and active partner deduplication review.

Only business-level evidence can unlock the geographic assignment procedure, and only separate privacy, editorial and publication checks can unlock SEO/indexing. Do not bypass these stages with a blanket owner approval.

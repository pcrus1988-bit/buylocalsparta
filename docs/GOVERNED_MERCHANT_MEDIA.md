# Governed merchant photography

Public merchant photography is optional and never inferred from arbitrary vendor uploads.

## Publication path

A merchant image may appear on `/shops` and `/vendor/[id]` only when all of the following are true:

1. the vendor is active in the Sparta market;
2. the published Greek merchant story is vendor-approved and has reached its publication time;
3. `merchant_stories.og_image` explicitly references the media record;
4. the media belongs to the same vendor;
5. the media is merchant/story media rather than canonical-product media (`canonical_variant_id IS NULL`);
6. the object is an approved public image type;
7. malware scan, rights review and moderation are all approved;
8. the private verified object still exists and matches its reviewed metadata when streamed.

The public directory validates these conditions before emitting a same-origin `/api/media/<id>` URL. The media route independently revalidates the same governance boundaries at read time, so revocation, story archival, vendor deactivation or moderation changes remove public eligibility immediately.

If no governed merchant image is available, the storefront retains the existing generated merchant artwork/initials. Product cards continue to prefer separately governed canonical product media and use category artwork as their fallback.

This feature intentionally does not scrape or automatically import storefront/merchant photography from the public web. Rights provenance remains part of the existing media-governance workflow.

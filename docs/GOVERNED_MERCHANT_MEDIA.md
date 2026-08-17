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

## Admin association workflow

The Admin CMS workspace exposes the explicit story-to-media association. It does not accept an arbitrary external image URL and it does not permit staff to bypass media governance.

For each merchant story, the selector contains only media that:

- belongs to the same Vendor as the story;
- is not assigned to a canonical product;
- is an image in the supported public formats;
- has completed the malware scan successfully;
- has approved rights provenance;
- has approved moderation;
- points to a verified private object.

The mutation is protected by the Admin `content.write` permission and CSRF verification, runs under the platform PostgreSQL scope in a serializable transaction, and records the change through the canonical Admin audit path. Selecting the empty option removes the association and immediately restores the generated storefront fallback.

Database-less previews deliberately do not persist real merchant-media associations.

This feature intentionally does not scrape or automatically import storefront/merchant photography from the public web. Rights provenance remains part of the existing media-governance workflow.

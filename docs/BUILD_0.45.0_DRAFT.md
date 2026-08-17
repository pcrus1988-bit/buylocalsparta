# Build 0.45.0 — draft

This branch closes the Build 0.44 visual gap by allowing governed merchant photography to replace generated merchant artwork when an explicitly approved merchant story references an approved Vendor-owned media asset.

## Scope

- `/shops` uses approved merchant photography when available and preserves generated artwork as fallback.
- `/vendor/[id]` uses the same governed merchant photography and fallback behavior.
- `/api/media/[id]` revalidates merchant-story publication, Vendor ownership, image type, scan, rights and moderation state before streaming.
- Product media behavior and Fair Vendor Exposure remain unchanged.
- No new migration is required; the existing `merchant_stories.og_image` field is used as the explicit story-to-media association.

The branch must pass the existing release/PR checks before this draft becomes the formal Build 0.45.0 release record.

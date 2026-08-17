# Build 0.45.0 — draft

This branch closes the Build 0.44 visual gap by allowing governed merchant photography to replace generated merchant artwork when an explicitly approved merchant story references an approved Vendor-owned media asset.

## Scope

- `/shops` uses approved merchant photography when available and preserves generated artwork as fallback.
- `/vendor/[id]` uses the same governed merchant photography and fallback behavior.
- `/api/media/[id]` revalidates merchant-story publication, Vendor ownership, image type, scan, rights and moderation state before streaming.
- Admin `/admin/content` now exposes a governed merchant-story image selector instead of requiring direct SQL.
- The Admin selector lists only same-Vendor, non-product images that are malware-clean, rights-approved, moderation-approved and backed by a verified private object.
- The story-media mutation requires `content.write`, CSRF verification and a PostgreSQL-backed Admin runtime, executes serializably and records the change through the canonical Admin audit service.
- Explicit image removal restores the generated storefront fallback immediately.
- Product media behavior and Fair Vendor Exposure remain unchanged.
- No new migration is required; the existing `merchant_stories.og_image` field is used as the explicit story-to-media association.

## Release gate

The branch must pass the full Production CI for the exact final commit, including fresh PostgreSQL/PostGIS migration and DB smoke, production worker image construction and the real Next.js production build, before this draft becomes the formal Build 0.45.0 release record.

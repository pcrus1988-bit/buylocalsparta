# CLAIM enriched profile deployment checklist (PR #1449)

The free CLAIM plan is a non-commerce directory entry. Never grant a vendor role, activate orders, or enable payment as part of this change.

## Production prerequisites
1. Confirm the **marketplace** PostgreSQL project (not FISCAL/NYXI) and establish a separate authenticated DBA migration channel.
2. Apply and verify `db/migrations/0438_hub_claim_profiles_media_inquiries.sql` using the repository's normal ordered migration mechanism. Update the migration ledger/readiness to expected schema **438**. Do not merge or release dependent code with schema **437**.
3. Confirm existing private object-storage bucket `buy-local-sparta-private` and credentials via the server-side `serverObjectStorageFromEnv` adapter. Production uploads fail closed when the bucket is missing. Do not expose service-role credentials in client JS.
4. Confirm moderators have Admin access to `/admin/hubs/claim-media` (super_admin required) and a documented process to assess business photography and rights. Images are not automatically scanned by the standard vendor-media scanning worker in this implementation; do not represent them as malware-scanned without integrating that worker. Only manually approved images are served publicly.
5. Check inquiry GDPR privacy notice, maximum retention, deletion/export requests and escalation channels. Inbox is visible only to a verified CLAIM owner.
6. Verify production Content Security Policy for `/hubs/<slug>/business/<id>` includes HTTPS frames **only on this route**; framing of KONTA MOY itself remains forbidden.
7. Verify iframe URLs must be public HTTPS and embedded content is loaded only after a visitor clicks **Προβολή ιστοσελίδας εδώ**. Third-party `X-Frame-Options` or `frame-ancestors` can prevent display; always show external link.

## Controlled acceptance
- Admin can view all new controls in read-only plan preview.
- Not-yet-approved CLAIM applications still render no public page or dashboard.
- Signed-in user with a different email, unverified account or no approved ownership cannot edit/upload or read inbox.
- Verified owner can save description, hours, phone, socials and iframe toggle; legal business identity/verified ΓΕΜΗ address is not editable.
- Website validation rejects http, IP literals, IPv6 local, localhost, internal hostnames and KONTA MOY itself.
- Upload JPEG/PNG/WebP ≤4MB into private bucket; validate header signature, owner and image count; pending images remain private. Admin approval publishes; replacement retires previous logo/cover.
- Customer inquiry requires same-origin POST, honeypot, consent, bounded inputs and per-IP rate limiting. No customer data or form contents in public profile HTML.
- Public profile shows reviewed media, hours, story, verified location map link, social links and optional consent-based iframe. If iframe blocked by the destination, external link remains functional.
- Run `node --experimental-strip-types scripts/verify-hub-claim-profile-enrichment.ts`, web TypeScript, full Production CI and Browser acceptance.
- Do not switch production aliases until database, object storage, privacy/retention and moderation sign-offs are complete.

## Current status
All changes are isolated on feature branch `feat/hub-claim-profile-iframe-media-20261011`. No pending application was approved, no live vendor was modified, and no production schema was changed by the GitHub source updates.

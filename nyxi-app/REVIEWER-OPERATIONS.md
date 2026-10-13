# NYXI Knowledge — Private Reviewer Runbook (2026-10-13)

## Current bounded scope
- Production Supabase project: `eemihhfreggbigxejjhj`.
- 303 registered sources; 278 extracted fragments from exactly three authorized FDA sources; 26 belong to their latest valid snapshots; 23 initially entered `human_evidence_review`, 3 marked `page_chrome_review`.
- There are **zero approved publication fragments** and **zero Supabase Auth users** at creation time.
- Public Source Atlas can expose active source *links*, not text fragments or recommendations.

## Reviewer account enrollment (owner operation)
1. From the Supabase dashboard for the production project, use **Authentication → Users → Invite user** for a **specifically authorized human reviewer**. Do not enable public signup as a workaround. Require email confirmation, choose a strong password, and consider MFA enforcement before adding publishing capabilities.
2. After the invite is accepted and the user's UUID is known, an authorized database administrator may grant *read-only* reviewer status using the SQL below. Confirm the exact UUID manually; no reviewer is seeded by this migration.
   ```sql
   INSERT INTO public.nyxi_reviewers (user_id, role, added_by)
   VALUES ('<verified-auth-user-uuid>'::uuid, 'reviewer', '<authorized-admin-identifier>');
   ```
3. Visit `https://nyxi.kontamou.site/admin` and sign in. The workbench shows source-linked, current-snapshot candidates only. It cannot approve or publish.
4. To revoke access promptly: `UPDATE public.nyxi_reviewers SET disabled_at=now() WHERE user_id='<verified-auth-user-uuid>'::uuid;`. Every private API call rechecks membership.

## Approval gate — not yet enabled
- Review text against *original source*, source rights/publication permission, expiry, scope of jurisdiction, quality/chrome, and exact fragment provenance.
- The read-only queue must NOT be used to issue approvals; completing it does not grant publication authority.
- A later independently audited approval/revocation API must write `metadata.review_status='approved'`, `metadata.review_required='false'`, and a separate `nyxi_fragment_publication_approvals` record only following a verified approver action, in a single transaction.
- Do not enable automatic approvals, bulk approvals, or direct editing of the private queue.
- Public search must continue to use `nyxi_reviewed_fragments_v1`, independent snapshot validity and per-result reapproval.

## Data-quality work
- Only 3 of 303 sources currently contributed extracted evidence. Review acquisition rights for additional active/discovered sources before collection.
- This is a private *review queue*, not a source approval queue. The other 300 sources require separate lawful acquisition and rights checks.
- Keep the queue readable solely by service role. The Edge handler uses Supabase Auth validation and `nyxi_reviewers` membership before access.
- Test `npm test && npm run build` from `nyxi-app/` and perform login tests with a newly enrolled reviewer before general availability.

## Deployment
- Edge: `nyxi-reviewer-queue` with `verify_jwt=true`.
- Next: `/admin`, `/api/reviewer/session`, `/api/reviewer/queue` all fail closed without a verified, enrolled identity.
- Never put Supabase service-role credentials into Vercel or browser JavaScript.

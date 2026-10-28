# MAZI — Supabase Auth × Resend production verification dossier

**Owner:** KONTA MOY Super Admin  
**Last independently checked:** 2026-10-28 (UTC)  
**Release status:** **NOT VERIFIED — PENDING HUMAN ATTESTATION**  
**Scope:** Login-link generation, transactional delivery, callback, session, one-use authentication and separate 45-minute admission limit. This document records evidence, not permission to issue an invitation, accept a member or activate finance.

## Actual production architecture (supersedes the pre-27 October SMTP instructions)

1. MAZI login form at `https://mazi.kontamou.site/join` calls a server action. MAZI uses a production-only HMAC secret to contact `https://kontamou.site/api/mazi-auth-email`; the browser never receives the bridge secret, a Supabase service-role key or a Resend key.
2. The marketplace backend checks an **existing, email-confirmed Supabase Auth account** against an approved and independently verified MAZI interest application **or** an existing verified member. A public login request creates no user and authorizes no membership. Abuse controls include advisory-locked 180-second cooldown and five attempts per 24 hours.
3. The backend calls the production Auth project `eemihhfreggbigxejjhj` at `POST /auth/v1/admin/generate_link`. It reads the hashed token from the actual GoTrue REST payload, builds `https://mazi.kontamou.site/auth/callback?token_hash=…&type=magiclink`, and sends the first-party link **directly through the Resend API** with a server-only key and idempotency key.
4. For a **new, individually approved invitation**, the separate Super Admin issuer uses the same Auth `generate_link` / Resend transport, with `type=invite`; the 45-minute admission cutoff remains stored in `mazi_invitations.expires_at`. Invitation approval and member admission remain separate SQL-verified steps.
5. The production callback supports an Auth PKCE code, a generated token hash, and legacy implicit-fragment links. It verifies on the server when possible and routes implicit credentials to `/auth/finish` without exposing them to the server. The destination is fixed to the MAZI origin.
6. **Supabase's default SMTP and hosted `SITE_URL` are not used to transport or build the direct Resend links above.** They can still affect unrelated/legacy Auth flows and require a separate configuration review. Do not use a successful Resend test as evidence that Supabase custom SMTP has been configured.

## Independently observed results (2026-10-28)

| Component | Observation | Evidence category |
| --- | --- | --- |
| Supabase project | `eemihhfreggbigxejjhj` active; server code binds the specific Auth project | Project and code inspection |
| Server credentials | Required MAZI/marketplace production environment-variable **names** present; secret values not retrieved or recorded | Vercel metadata |
| Sending domain | `kontamou.site` verified in Resend; SPF and DKIM verified | Resend domain details |
| DMARC | DNS TXT `v=DMARC1; p=none;` (monitoring only, not enforcement) | Vercel DNS record |
| Existing-account Auth token | 2026-10-28 06:36:27 UTC `/auth/v1/admin/generate_link` HTTP 200 | Supabase Auth logs |
| Email transport | Resend recorded two delivered MAZI login messages on 2026-10-27 and 2026-10-28; latest 06:36 UTC | Resend delivery and API logs |
| Auth token verification | 2026-10-28 06:37:00 UTC `POST /verify` HTTP 200, followed by `GET /user` HTTP 200 | Supabase Auth logs |
| Callback reachability | `/auth/callback` HTTP 200 and invalid-token request returned to `/join?notice=expired_link`; unauthenticated `/members` redirected to login | Vercel protected live fetch |
| Browser-session provenance | Auth service logs reported `http://localhost:3000` as a **referer** for the successful verification. This does not prove production-browser callback completion; it also does not prove the direct Resend link itself points to localhost. | Supabase request logs |
| Admission records | One approved application; no invitations, invitation acceptances, verified members or Super Admin release reviews at inspection | Read-only database queries |
| Private tables | MAZI invitation and auth audit tables protected by RLS; no direct `anon` / `authenticated` SELECT grants in checked set | PostgreSQL privilege checks |

**Earlier regression:** 2026-10-27 09:18 UTC Auth link generation returned HTTP 200 but code misparsed the REST `hashed_token` and did not send an email. The top-level hash extraction was corrected in PR #1820; subsequent recorded delivery and verification succeeded. This is not evidence that every failure/retry scenario passes.

## Evidence still needed before the Super Admin may tick all seven checkboxes

1. Confirm the actual Supabase Auth project, role binding and browser/server configuration without writing secrets to evidence.
2. Examine one **consenting recipient's original delivered Resend message** and confirm its action URL points to `https://mazi.kontamou.site/auth/callback`, not localhost. Verify full browser login on the deployed MAZI site and durable server-side cookie/session access to `/members`, not merely an Auth `/verify` response.
3. Inspect live Supabase Auth OTP expiry setting; test one-use and expired-link behavior using authorized credentials. Separately verify the independent 45-minute *invitation admission* cutoff in the server-side SQL. Do not confuse the two clocks.
4. Verify SPF, DKIM and **DMARC alignment** against an actual delivered MAZI email. Because `p=none` is monitor-only, decide whether a staged stronger policy is appropriate only after inventorying all legitimate senders.
5. Exercise one real, consent-based business invitation and acceptance once the two prerequisite launch reviews are valid. Confirm ΓΕΜΗ/AFM representation, email ownership, terms acceptance, one-time consumption, rejection on retry/expiry/revocation and **no** billing or voting privilege.
6. For a bounced/failed/ambiguous email, reconcile provider records and the private attempt/invitation log **before** any individual resend. Test repeat-request throttling and incident response without soliciting unsolicited emails.
7. Keep `auth_email_delivery`, `legal_and_retention` and `consenting_business_e2e` decisions pending until the **actual** prerequisites have evidence and the authenticated Super Admin records the legally appropriate decision. Do not mark these automatically from documentation, CI, DNS or a successful provider API response.

## Audit protocol

Record timestamp, testing role, real result and a restricted evidence reference in the Super Admin operations review. Never put a recipient's email, access token, token hash, provider credentials or a personal callback URL in the review. **The review screen is an attestation form, not a test runner or automatic release decision.** An explicit `reopened` review supersedes a previous `verified` review.

Production deployment is allowed to remain live in non-financial, invite-gated mode. These findings do **not** authorize invitations, automatic retries, paid subscriptions, fund custody, grant awards or voting.

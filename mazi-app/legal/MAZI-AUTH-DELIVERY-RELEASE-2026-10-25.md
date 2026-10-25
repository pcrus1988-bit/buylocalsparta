# MAZI — Supabase Auth delivery release dossier (DRAFT · 2026-10-25)

**Owner:** KONTA MOY Super Admin. **Status:** NOT VERIFIED. This file is a verification protocol, not a claim that email delivery succeeded. No trial/simulation users or unsolicited test invites. No production invitation until the existing two human release gates have real documentary evidence.

## Architecture — as implemented
- MAZI app `https://mazi.kontamou.site` uses Supabase's **public** publishable key only; it does not send administrative invites.
- Marketplace Admin `/admin/mazi/interest` is the sole invitation issuer. Server-only Supabase project: `eemihhfreggbigxejjhj`.
- New contacts: Supabase Auth admin `POST /auth/v1/invite` to verified contact email. Existing confirmed accounts: one `POST /auth/v1/otp` with `create_user:false` only upon a recognized account-exists response. No public signup.
- Fixed same-origin callback: `https://mazi.kontamou.site/auth/callback` with PKCE/token-hash exchange. Invitation admission is separately authorized in PostgreSQL; merely following an email link is not membership.
- Local invitation admission expires 45 minutes after issue (database constraint). Provider email OTP expiration must be recorded and reconciled, ideally **no more than 45 minutes**. Revoked and expired invitation records must never admit members.
- A provider HTTP success is **acceptance for processing**, not proof of SMTP delivery or recipient receipt.

## Verification checklist — Super Admin must complete with real evidence
1. **Supabase project identity:** Authentication configuration belongs to `eemihhfreggbigxejjhj`. Make sure `SUPABASE_URL` and server-only service credentials match this project. Do not paste secrets into audit notes.
2. **Custom SMTP:** In Supabase Dashboard → Authentication → Emails → SMTP Settings, configure an authorized production transactional provider (e.g. Resend/SES via an approved sending domain). Confirm SMTP enabled, verified from-address, and sent/failed event access. Supabase's default shared SMTP is not production suitable and can reject non-team recipients.
3. **Domain authentication:** Verify SPF, DKIM, DMARC for the From domain using the provider's verified-domain dashboard. Do not assume a Resend API key on the KONTA MOY frontend proves Supabase Auth SMTP is configured.
4. **Redirect settings:** Authentication → URL Configuration: Site URL `https://mazi.kontamou.site`; redirect allowlist explicitly includes `https://mazi.kontamou.site/auth/callback`; verify no untrusted wildcard or foreign callback. Document actual settings.
5. **Expiration and templates:** In Auth provider settings, confirm exact OTP expiry, email confirmation behavior, invite template and existing-user magic-link template. Test that links, subject, From identity and Greek content are appropriate. The 45-minute MAZI application limit still applies.
6. **Real controlled test:** With a **consenting recipient** who is entitled to access a real approved business, issue one operator-authorized invitation. Record provider message acceptance, delivery/bounce where possible, inbox receipt, callback completion, and the confirmed email/account identity. Verify that there are no duplicate invites and that an expired/revoked record cannot be accepted. Do not send emails merely to fill a checkbox. Existing-account flow should be verified only when a real consenting existing account exists.
7. **Incident response:** If email is bounced/blocked or provider status is uncertain, keep the delivery gate reopened and reconcile the provider log before any resend. Do not reissue on blind retry. Store only evidence references and outcome, never message tokens or full email addresses in the release-gate evidence.

## Required evidence to accompany `auth_email_delivery` verification
- Timestamp and operator; Supabase project ref; sender domain and provider (no passwords).
- Evidence location / ticket reference for SMTP/domain/redirect/OTP configuration.
- One authorized delivery test reference and exact type (new invite vs existing account OTP), outcome of callback/admission, and confirmation of no duplicate email.
- Follow-up owner for any remaining provider error. Gate must remain **reopened** if any critical item is unverified.

**No automatic grant, paid membership, community privileges, or voter eligibility is enabled by this verification.**
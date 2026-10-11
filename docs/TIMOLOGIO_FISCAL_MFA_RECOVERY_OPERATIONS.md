# FISCAL M22 — MFA lost-device recovery SOP (proposed, NOT approved)

## Release hold and responsibility
This document is an **implementation proposal**, not authorization to run a real
recovery. Until an accountable security officer signs off, keep both
`FISCAL_MFA_RECOVERY_ENABLED` and `FISCAL_OPERATOR_MFA_ENFORCED` unset/OFF.
Do **not** add synthetic, shared or emergency `super_admin` identities to
production just to satisfy the two-person quorum.

### Why recovery is blocked in the current deployment
The production database had only **one active marketplace super-admin TOTP
factor** when Milestone 22 was reviewed. To recover that administrator through
this workflow, **two other** independently verified super-admins must already
have distinct authorized accounts and active, recently stepped-up MFA. This
means a minimum of three independent enrolled super-admin accounts, plus an
approved manual identity-assurance process. Counts must be revalidated before
activation; a factor count alone cannot establish three different people.

## 1. Security-officer preflight
1. Confirm the actor requesting recovery still possesses their **primary**
   authenticated KONTA MOY / FISCAL session. If primary login is compromised
   or unavailable, **stop this procedure**; use a separate incident-controlled
   primary-account recovery process, not MFA reset.
2. Independently identify the requesting person using previously validated
   records and **call back a separately established contact channel**.
   Reject contact details given only in the request itself. Do not accept
   possession of email, browser session, a one-time code, or a photo ID sent by
   unknown email as sufficient on its own.
3. Obtain the authorized business owner or security officer's approval and
   record the requester, evidence source, officer, incident/ticket ID, date,
   and reason in an **access-controlled offline case management system**.
4. Generate a unique hard-to-guess `REC-[A-Z0-9-]{8,60}` case reference.
   It is a correlation value and **not** an authentication credential.
5. Assign two independent super-admin approvers who are **not the affected
   account holder**, preferably outside the requester's reporting line.
   Confirm both use distinct identities, devices and active MFA enrollments.
6. Confirm their authorization, the FISCAL database migration, alerts,
   recent restore drill, and the reviewed feature flag before permitting
   the API to accept a request.

## 2. Controlled operator sequence
- Target signs in with their existing primary session and opens
  `/timologio-admin/mfa/recovery`, then requests recovery using the
  already documented offline `REC-...` reference. One pending 24-hour
  case is allowed. The API derives the target from the authenticated session.
- Approver A independently opens the offline ticket (not the web interface's
  request data), re-verifies identity with the security officer, enters their
  independently obtained `REC-...` reference, records attestation and approves
  with their own live 15-minute TOTP step-up.
- Independently, approver B repeats this process. They must be a distinct
  enrolled super-admin and must not reuse approver A's device, session, or
  identity verification. The code entry view does **not reveal** the
  reference. The database refuses completion without both approvals.
- Only upon the second approval do the application and database authorize the
  atomic reset of the old factor. Existing step-up tokens are revoked; the
  requesting actor's primary session is not modified.
- Target then performs **fresh MFA enrollment** at
  `/timologio-admin/mfa` and proves possession of the new TOTP.
  Re-verify that old MFA codes and step-up cookies are rejected.
- Security officer records completion and closes the offline incident with
  the resulting immutable FISCAL audit event / recovery case ID, without
  storing the new TOTP secret anywhere in the incident system.

## 3. Required alerting (not yet implemented)
Automatic independent out-of-band **security notifications** must be
implemented, tested, rate-limited and delivered to approved destinations:
- `security.mfa_recovery_requested`: immediately alert security officer,
  subject to privacy-minimized content; also alert registered account holder
  through an independently verified channel.
- `security.mfa_recovery_approval_recorded`: notify security operations of
  approver count but never reveal TOTP material or offline evidence reference.
- `security.mfa_recovery_completed` and cancellations: alert owner and SOC,
  with follow-up owner confirmation after new factor activation.
- Alert on duplicate/repeated/denied attempts and anomalous volumes.
Use a durable outbox/retry mechanism. Audit-table writes are not by themselves
a delivery guarantee. Do not make email delivery a single point of authorization.

**Until alerts are live, this release gate is FAIL and recovery must stay OFF.**

## 4. Emergency and loss scenarios
- Fewer than two qualified *other* enrolled super-admins: **stop**, keep
  mandatory MFA OFF, use formally approved offline administrator continuity.
  Never override the quorum by sharing credentials or bypassing checks.
- Lost primary SSO session or suspect compromise: initiate a separate
  account/session security incident. This MFA mechanism cannot restore SSO.
- In-flight case expires after 24 hours: request a **new** verified ticket
  and verify any prior approvals are no longer reusable.
- Offline identity evidence differs, requester denies activity, suspicious
  geography, or other fraud signal: cancel the case, revoke affected primary
  sessions through the primary identity service, and escalate to security
  response. Do not perform speculative recovery.
- Database failure: do not manually edit factor or approval tables; restore
  service using documented tested backup/restore process before retries.
- Encryption-key problem: never rotate
  `FISCAL_OPERATOR_MFA_ENCRYPTION_KEY` without versioned key migration and
  decryptability tests, since losing the key invalidates stored active factors.
- Rollback: set `FISCAL_MFA_RECOVERY_ENABLED=false` in the standalone FISCAL
  project and verify it takes effect on the active production deployment.
  Do not delete any recovery audit or approval rows. Keep mandatory MFA
  disabled until operators retain a functional tested recovery path.

## 5. Evidence required to lift the release hold
- Authorized security-officer and privacy review sign-offs.
- Source-control review of migration 0018, all CI and isolated Vercel preview.
- Ephemeral PostgreSQL race/replay, forged actor, row-lock, tenant and HTTP
  positive/negative test results, plus manual browser validation.
- At least three distinct **real and authorized** enrolled SSO super-admins,
  with documented operational delegation. Current counts must be verified.
- A demonstrated two-approver recovery and lost-device drill involving
  synthetic identities and no real person's authenticator reset.
- Tested independent notifications to account owner/SOC, with delivery
  retries, alert failures, and incident correlation.
- Approved recovery/backup procedure, encryption key custody and disaster
  recovery drill.
- Approval to enable the *recovery* flag first; mandatory MFA is a **separate**
  change requiring a successful post-activation recovery drill.

## Explicit prohibitions
Do not collect passwords, TOTP seeds, biometric identifiers, official ID
numbers, passport scans or ID photos through the recovery UI. Never disclose
the REC evidence reference in approval listings. Never override RLS, bypass
CSRF/Origin, reuse other operators' sessions or identify recovery approval with
legal KYB/AADE identity verification.

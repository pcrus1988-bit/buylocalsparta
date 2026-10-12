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

## 3. Durable alert outbox — integration built, not activated

Isolated migration `0019_security_alert_outbox.sql` adds
`fiscal_security_alert_contacts` and `fiscal_security_alert_outbox` with
RLS, immutable event/recipient identity, bounded state transitions, and
unique per-event/per-recipient delivery identities.

Recovery transitions `requested`, `approval_recorded`, `completed`,
and `cancelled` must enqueue **two** outbox items in the same transaction:
one for the independently verified security-officer contact and one for the
independently verified affected account owner. If either is missing, or the
two destinations are identical, the recovery transaction rolls back.
The code never trusts the user's newly supplied email or the latest unverified
SSO email. Recipient addresses must be independently enrolled into the
private contact registry through a security-authorized offline process; do
not insert personal contact details without documented authorization.

The private dispatcher runs at
`POST /timologio/api/security-alert-dispatch`; it accepts only a dedicated
64-hex bearer credential in standalone FISCAL mode. It uses Resend with a
stable per-outbox-row `Idempotency-Key`, three-item leases per invocation,
eight-attempt maximum, exponential backoff, and a strict <23-hour retry
window (Resend idempotency retention is only 24 hours). Permanent provider
rejections and expired retries are marked `dead` for officer investigation.
`provider_accepted` means only that the provider accepted the message;
it is **not proof of delivery to the recipient inbox**.

The five-minute GitHub Actions schedule at
`.github/workflows/fiscal-security-alert-dispatch.yml` is **disabled by
default** until GitHub variable `FISCAL_SECURITY_ALERT_DISPATCH_ENABLED`
is exactly `true`. Separately configure:
- Dedicated standalone Vercel FISCAL `FISCAL_SECURITY_ALERT_DELIVERY_ENABLED=true`
- Dedicated standalone Vercel FISCAL `RESEND_API_KEY` and
  `FISCAL_SECURITY_ALERT_FROM` (approved sender/domain)
- Dedicated standalone Vercel FISCAL `FISCAL_SECURITY_ALERT_DISPATCH_TOKEN`,
  64 lowercase hex, plus the same value in GitHub Actions secret
  `FISCAL_SECURITY_ALERT_DISPATCH_TOKEN`
- Verified, non-revoked `soc` contact and one `account_owner` contact for
  every affected actor, each with approved verification provenance

Do not enable the scheduler until manual and automated synthetic delivery
drills pass. Route bearer keys and provider keys must never appear in log,
source, ticket, or browser responses. Rate limit and independently review
contact registry writes. If the provider blocks, pauses or suppresses an
address, explicitly investigate and notify through an authorized secondary
security channel; accepted provider API responses do not eliminate that
operational gap.

### Signed provider delivery callbacks and alert operations (unreleased)

Migration `0020_security_alert_delivery_receipts.sql` installs an **append-only**
provider delivery event ledger; it is separate from Resend's initial API
acceptance record. The dedicated FISCAL endpoint
`POST /timologio/api/security-alert-webhook` requires:
- `FISCAL_STANDALONE_MODE=true`, `FISCAL_SECURITY_ALERT_DELIVERY_ENABLED=true`,
  and `FISCAL_SECURITY_ALERT_WEBHOOK_ENABLED=true`, each separately approved
- The dedicated webhook's **own** `FISCAL_SECURITY_ALERT_WEBHOOK_SECRET` value
  (the Resend `whsec_...` key) in the standalone FISCAL deployment, not in
  browser code, GitHub, or the marketplace's existing Resend webhook
- A separately registered endpoint in the authorized Resend account for
  `email.delivered`, `email.delivery_delayed`, `email.bounced`,
  `email.failed`, `email.complained`, and `email.suppressed`

The existing first-party `ResendWebhookVerifier` verifies raw-body Svix
signatures, timestamp tolerance and event ID. The handler enforces a 16KB
payload ceiling and stores only events matching **already provider-accepted**
FISCAL alert IDs; duplicate provider event IDs are idempotent. A signed
provider event unrelated to FISCAL is acknowledged but not persisted.
Events arriving before the API acceptance transaction is committed may
be missed: **this timing scenario needs controlled provider testing or
provider-side reconciliation** before claiming guaranteed delivery
accounting. This endpoint is intentionally OFF in current production.

The private read-only operations screen is at
`/timologio-admin/mfa/alerts`. Only an authenticated marketplace super-admin
with recent, session-bound MFA may view it. It reveals event classes,
attempt counts, queue state, receipts and abbreviated case IDs. It does
**not** reveal recipients, recovery evidence, TOTP material, webhook signing
secrets or provider IDs. A delivery receipt means that the receiving
**mail server** accepted the message, not proof that the human read it.
Bounces, complaints, failures and suppression override an earlier
delivered receipt in the security view. Human security-officer escalation
remains mandatory; this display is not an automatic incident response
engine. Signed webhook secret rotation and independent outage tests are
pending.

### Bounded late/early webhook reconciliation (draft, never enabled in production)

Isolated migration `0021_security_alert_reconciliation.sql` adds private,
RLS-protected reconciliation leases and distinguishes
`signed_webhook` from `provider_api` receipt evidence. It intentionally
stores **no uncorrelated Resend events, recipients, message contents, or
arbitrary email IDs**.

When a FISCAL notification send is accepted, the dispatcher atomically
persists its provider ID and enqueues a reconciliation job for that exact
outbox row. The same **private** five-minute dispatcher (when explicitly
enabled) retrieves only `GET /emails/:id` for those previously accepted
FISCAL IDs; it checks the Resend-reported message ID **and exact recipient**
before creating a bounded `provider_api` observation. A signed webhook
which arrived too early may have been safely acknowledged and ignored;
subsequent API lookup recovers the provider's current `last_event` without
ever retaining unrelated webhook messages. Status is a **snapshot**:
it does not reconstruct the full provider event sequence or original
event timestamps. Unexpected or unrecognized states remain unconfirmed.

The queue is isolated, leased for 90 seconds, processed in batches of three,
limited to twelve checks within 23 hours and has terminal reconciliation
states. A recipient mismatch is a security failure, never a delivery receipt.
`email.delivered` indicates acceptance by the receiving mail server, not
human reading; the final event may be overwritten by a later bounce.
Successful delivered snapshots are checked again every two hours while
inside the bounded period. Webhook signatures remain the primary source of
timestamped delivery events.

`FISCAL_SECURITY_ALERT_RECONCILIATION_ENABLED` must explicitly be set to
`true` **in the dedicated FISCAL project** before any recovery action can
execute. It is not configured in current production. Unknown, delayed,
unavailable and API-invalid provider states never count as verified delivery.

This closes the deterministic **accepted-row vs callback ordering gap**
when the Resend API last-event snapshot still exposes the missing outcome.
It does not guarantee historical event completeness, sender-domain
deliverability, incident detection, or real recipient notification.
Operator-owned escalation and real-provider drill requirements remain open
under Issue #1477; do not activate recovery based on synthetic tests.

## 4. Additional release requirements and missing integrations

Automatic independent out-of-band **security notifications** must be
fully configured, tested, rate-limited and delivered to approved destinations:
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

**Until verified contacts, schedule, provider acceptance, notification delivery evidence and alert failure handling are operationally proven, this release gate is FAIL and recovery must stay OFF.**

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

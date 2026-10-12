# FISCAL Milestone 22 — controlled MFA recovery (release hold)

**Release mode: fail closed.** The feature is unavailable unless the dedicated FISCAL
deployment explicitly sets `FISCAL_MFA_RECOVERY_ENABLED=true`. This must remain
OFF until independent security review, a second and third independent enrolled
marketplace super-admin for recovery of a super-admin, audited live drills,
documented out-of-band identity checks and incident alerting have been approved.
Never enable mandatory MFA just to test recovery.

## Model
1. Only the *current authenticated operator* can request recovery of their own
   **active** TOTP factor, using a verified external offline identity case
   reference `REC-...`. The API cannot accept a target ID, target account or
   arbitrary email. One pending 24-hour case per target; requests are
   rate-limited and audited.
2. Two distinct **other** marketplace super-admins, each with independent,
   session-bound 15-minute TOTP step-up, must separately confirm they have
   checked the same external case and verified the account owner offline.
   A reviewer cannot self-approve or contribute two votes. A fiscal_admin
   cannot approve recovery.
3. Case and factor rows are locked inside the same PostgreSQL transaction.
   The second approval **atomically** resets the existing factor to an
   unactivated placeholder, invalidates its previous secret, revokes all
   outstanding MFA step-up sessions and closes the case. It does not revoke
   the operator's primary SSO session, reset the SSO password, auto-enroll an
   authenticator, grant roles, approve merchants or authorize fiscal issuance.
4. A target may then navigate back to `/timologio-admin/mfa`, begin fresh
   enrollment and prove a new TOTP code. An unsigned 6-digit code is never a
   substitute for a separate identity review.

## Controls
- New private tables: `fiscal_mfa_recovery_cases` and
  `fiscal_mfa_recovery_approvals` (isolated migration 0018).
  Both have RLS and no `anon`/`authenticated` Data API grants.
- Approvals are append-only and cases are terminal-state irreversible.
  Primary actors, evidence references, timestamps and approvals cannot be
  changed once recorded. Every request, approval, cancellation and completion
  also writes an immutable FISCAL audit event.
- Request and approval APIs are POST-only with strict Origin/CSRF, JSON
  schema/body limits, replay prevention and per-operator rate limiting.
  GET is restricted to logged-in operators; a super-admin can only list
  other users' pending cases after recent MFA step-up.
- **No** photo ID images, OTP secrets, emails, document uploads, free-text notes
  or recovery links are stored in recovery rows.
- Out-of-band reference attestation is not cryptographically proof of identity.
  Business policy must require actual independent verification by both
  signers before either selects the confirmation checkbox.
- The approvers' GET API deliberately **does not disclose** the `REC-...`
  evidence reference. Each approver must independently obtain it through the
  offline case workflow; copying the requester's evidence from the web screen
  is not accepted as independent verification.
- The database trigger itself refuses the `completed` transition without
  **exactly two immutable, distinct, non-target super-admin approvals** for
  the matching case and evidence. This supplements, not replaces, the
  application transaction's authorization, MFA/session binding and audit.

## Deployment checklist
- [ ] Verify all relevant Fiscal Foundation CI, Production CI, Browser acceptance,
      disposable PostgreSQL and live HTTP negative/positive tests.
- [ ] Independently review migration 0018 including RLS, triggers, indexes,
      immutable evidence and least-privilege database role.
- [ ] Apply migration **only to the isolated FISCAL database**, after backups,
      NEVER to the marketplace Postgres instance.
- [ ] Deploy feature with flag absent/OFF; confirm normal SSO, existing MFA and
      no-issuance health remain operational.
- [ ] Provision at least two separate eligible approvers other than the target
      and confirm that no one actor can make both approvals.
- [ ] Establish identity assurance SOP, incident notification, investigation
      retention, key rotation procedure and secure rollback of this capability.
- [ ] Run a documented failure/replay/recovery drill against nonproduction data.
- [ ] Authorize `FISCAL_MFA_RECOVERY_ENABLED=true` separately, with evidence.
- [ ] Keep `FISCAL_OPERATOR_MFA_ENFORCED` OFF until recovery has actually been
      tested and the super-admin emergency procedure is operational.

**Do not deploy this PR or migrate 0018 automatically.** It is a reviewable
implementation candidate, not evidence that production recovery is supported.

# ΜΑΖΙ — Operational GDPR and retention control protocol
**Version:** 2026-10-28 · **Classification:** restricted operational instructions · **Status:** implementation evidence, NOT a lawyer's final approval.
**Operator:** SP BUSINESS LAB / ΚΟΝΤΑ ΜΟΥ. **Public authoritative notices:** https://mazi.kontamou.site/privacy and https://mazi.kontamou.site/legal/retention.
**Enforceable pilot contract:** `mazi-invitation-terms-v1`. Paid membership and award contracts require separate acceptance.

## 1. Current verified implementation (not a certification)
- Public legal architecture is versioned; the non-financial pilot must remain separate from any paid benefits.
- Super Admin-only `/admin/mazi/privacy-requests` records an administrative case ID, the real received date, rights category, identity check, documented extension notification, actual response, legal hold status and internal evidence references. It never reads email automatically or contains the request text, identity document, name, email or ΑΦΜ.
- Every case change has an append-only `mazi_privacy_request_events` record. RLS is enabled, direct anon/authenticated access is revoked, and the user-facing actions require persisted Super Admin authorization and CSRF. The database is *not* a replacement for the original source/email correspondence.
- Delayed responses stay overdue: extension notice is allowed only with evidence of notification within the first month and a lawful complexity/volume reason; there are no self-authorizing extensions.
- No automatic deletion, data export, identity matching, external email delivery, backup restoration or processor notification runs as a result of this register.
- `mazi_launch_gate_reviews` remains unverified until actual evidence and approval. Checking an on-screen box is not a lawyer's opinion.

## 2. Rights-request handling, arts 12–22 GDPR
1. **Receipt:** monitor `info@kontamou.site` (and any published rights channel) every working day. Register each actual request immediately, preserving its source in a restricted mailbox. Intake a `GMAIL-THREAD-...` or equivalent opaque internal ticket reference without an email address, identity or message in MAZI.
2. **Deadline:** log the *received calendar date*, not the entry date. Respond without undue delay, normally **within one calendar month**. If and only if complexity/number warrants it, actually notify the requester *within that first month* of up to two additional months, explaining why. Record notification date, reason and a real dispatch/delivery evidence reference. A legal hold does **not** extend the Article 12 deadline.
3. **Identity:** use only proportionate verification, particularly before disclosure/export/rectification; avoid blanket collection of extra identification. If unable to verify, give the lawful explanation and recorded response; do not disclose another person's records.
4. **Search and case assessment:** map request to MAZI applications, Supabase Auth, invitations, accepted terms, members, forum/livechat, listings, moderator audit, marketing, services, payment/ledger if really active, email provider, exports, logs and backups. Document each applicable lawful basis and statutory exception separately.
5. **Execute externally, then record:** fulfil permitted access/rectification/erasure/restriction/portability/objection in each relevant data source under approved controller instructions. Cross-entity deletion must respect foreign keys, other members' rights, active disputes, accounting duties and audit record necessity. No unaudited bulk database purge.
6. **Reply:** communicate an actual decision to the verified requester securely. Store the real sent-message/ticket reference, response day and correct outcome in MAZI. Refusal/partial disclosure requires reasons and information about complaint rights and judicial remedy. If a hold persists, record its specific reason in restricted evidence and explain the lawful restriction as appropriate.
7. **Post-case:** preserve only minimum evidence and review case records themselves against a separate, approved retention schedule; append-only does not mean perpetual retention is automatically justified.

## 3. Retention adoption gate (must not self-certify)
For each category identify: controller-approved purpose, lawful basis, exact trigger, exact maximum period, table or provider, processing owner, storage/backup limits, third-party data risks, legal hold criteria, erasure method, audit evidence, notification obligations and a test outcome. Version the signed decision and effective date. Proposed old periods (12 months interest, 90 days invitation, etc.) are *not* executable retention instructions. Do not promise that all backups are purged simultaneously; record the real overwrite/expiry process and access restrictions.

Before implementing jobs, run anonymous test fixtures in a nonproduction environment, verify dependencies and rollback, audit affected records, assess deletion versus anonymisation, and obtain documented controller and Greek legal review. Keep production cleanup disabled until those checks are satisfied.

## 4. Mandatory processor and technical checks
- **Article 28 processor contracts and subprocessors:** independently inspect actual agreements and current provider services for Supabase, Vercel, Resend and any other actual processor. Record data locations, role split, subprocessor roster, audit/access rights, breach notice, return/deletion terms.
- **Articles 44–49 transfers:** map actual EEA/non-EEA transfers, adequacy decisions, SCCs and transfer impact assessments where necessary; do not assume that a provider's European region means all support, logs or subprocessors remain in the EEA.
- **Articles 5, 25, 32 security:** document least privilege, encryption, access reviews, rate limiting, MFA for privileged accounts, secret rotation, recovery drills, immutable event review, backup and restore controls.
- **Articles 33–34 incidents:** maintain a decision log for personal-data breaches; notify the DPA *where the Article 33 threshold is met* within 72 hours of awareness where feasible, documenting any delay; assess notices to people where high risk under Article 34. Vendor alerts are not themselves a complete breach assessment.
- **Cookies, Law 3471/2006 Article 4(5):** inventory storage/scripts, distinguish strictly necessary vs optional and ensure optional access/placement is blocked before informed consent; equally easy withdrawal. Test site and app, authenticated and unauthenticated.
- **Article 30 RoPA and Articles 35–36:** complete real processing inventory, any applicable legitimate-interest assessment and DPIA screening. Obtain expert review where required.
- **Marketing and paid membership:** keep actual advertising consent/permissions, platform marketing approvals, billing, fund allocation and financial offers separate from GDPR approval and from pilot invitation acceptance.

## 5. Evidence for seven legal-release attestations
1. Controller details and a dated lawful-basis mapping including representative identities verified against official records.
2. Immutable hash/version and live URLs of the actually published Privacy, invitation v1 and governing policies; examples of actual accepted version receipts.
3. Signed category-by-category retention matrix and provider-backup assessment; an adoption date.
4. Tested safe deletion/anonymisation/holds/export with approved results, and scoped exceptions.
5. Monitoring evidence for `info@kontamou.site`, one real consenting rights-case response and a documented timed escalation rule.
6. Current DPAs, subprocessors, transfer mapping, access/backup/incident assessment with dated owner review.
7. Final explicit controller and independent qualified Greek legal approval; references must be real, retrievable and appropriately redacted.

### Readiness rule
**Do not set `legal_and_retention=verified`** until all seven categories have independent dated evidence. A real full lifecycle must be verified separately from documentation. Never invent a successful test, sign for someone else, or represent the status as approval from a lawyer.

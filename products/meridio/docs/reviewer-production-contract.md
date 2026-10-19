# MERIDIO: Production Reviewer & Asset-Approval Contract

**Status:** Architectural specification only, 2026-10-19. Not implemented against a database.

## Do not confuse the public Review Lab with an admin dashboard

- \`/review-lab/\` is a **fictional, client-side, non-persistent demonstrator**.
- Everyone can impersonate fictional demo personas. Browser-driven role choice offers no real authorization.
- The demo's synthetic evidence labels are not files, source documents or verified provenance.
- The displayed timeline is an in-memory trace, not an authenticated, immutable audit system.
- No code in \`public/\` may be relied upon for server-side authorization.

## Production prerequisites

1. Confirm the intended **SP BUSINESS LAB Supabase organization** and provision a new dedicated MERIDIO project in the chosen EU region; do not use the KONTA MOY marketplace's or FISCAL's production database.
2. Preserve GitHub monorepo reuse while retaining independent project environment variables, service account, storage buckets, object authorization and deployment.
3. Use a verified identity issuer (Supabase Auth or explicitly verified shared-SSO tokens); the backend, never request JSON, maps JWT subject to \`tenant_members\`. Require active membership, tenant-scoped role and explicit organization selection. A role selected by a user is never authoritative.
4. Apply reviewed SQL migrations using a migration runner on the dedicated project; extend the draft schema with audited composite foreign keys, deny-by-default RLS policies, unique scoped identifiers, and \`FORCE RLS\` in the relevant schema. Test with actual auth roles, not only service role.
5. Private evidence storage is mandatory, with versioned uploads, content sniffing, malware scanning, object digests, provenance and private signed read grants. Never return direct private object keys to public consumers.
6. Reviewer cannot approve an asset they created, nor verify evidence they submitted. If jurisdiction warrants, require a second independently assigned compliance reviewer. Assure reviewer access is limited to authorized tenant/case scope, rather than broad global grants.
7. Build each transition as one atomic database transaction with an expected version, idempotency key, authoritative identity, evidence snapshot, publication gate and insert-only audit event. On conflict, return HTTP 409; unauthorized actions return 403 without leaking cross-tenant existence; malformed requests return 400.
8. Publication is a separate, reversible and auditable operation, not an effect of completing a browser checklist. A published asset also needs legal, privacy, financial, editorial and operational release gates. **No securities, ownership subscriptions, investment representations or tokens can be enabled from this review feature.**

## Proposed internal endpoints (not live)

| Method | Route | Role | Allowed state | Result |
|---|---|---|---|---|
| GET | \`/api/v1/tenants/{tenantId}/assets\` | Active tenant member | All scoped | Paged, permission-filtered assets |
| GET | \`/api/v1/assets/{id}/evidence\` | Assigned operator/reviewer | Private | Evidence metadata only |
| POST | \`/api/v1/assets/{id}/evidence\` | Assigned operator | Draft/evidence pending | Signed staging upload request; no public object |
| POST | \`/api/v1/evidence/{id}/review\` | Independent assigned reviewer | Submitted | Verified/rejected evidence event |
| POST | \`/api/v1/assets/{id}/submit\` | Assigned operator | Evidence complete | Asset under review |
| POST | \`/api/v1/assets/{id}/approve\` | Independent assigned reviewer | Under review | Conditional signed approval |
| POST | \`/api/v1/assets/{id}/publication\` | Authorized publisher | Separately gated | Publication transition |
| GET | \`/api/v1/assets/{id}/audit\` | Explicit auditor/owner | Scoped | Redacted, paginated event history |

### Common write contract

A write must include:

- \`expected_version\` (nonnegative integer; mandatory for optimistic locking).
- \`idempotency_key\` (unique random request identifier bound to actor, tenant, route and payload digest).
- \`reason\` for exceptional decisions and suspension.
- **No** \`user_id\`, \`tenant_membership_role\`, \`approved_by\`, or \`is_admin\` supplied by client is authoritative.
- Server-derived actor, verified tenant membership and controlled state transition.

Use database-generated event sequencing and cryptographic hashes if required for evidential-grade trails; mere JSON arrays on a browser are not immutable.

### Threat-model acceptance cases

- Cross-tenant asset enumeration and cross-tenant evidence IDs.
- Reviewer attempting self-approval or self-verification.
- Attempt to edit reviewed documents after approval.
- Unauthorized invitation, revoked memberships, reused JWTs and tenant switching.
- Stale expected version, duplicate idempotency key with mutated payload, retried requests.
- Concurrent approval and suspension, backdated/expired legal evidence, malware-positive attachment.
- Missing source provenance or legal jurisdiction, changed disclosure version.
- Read leakage through analytics, object storage URLs, caches or audit event payloads.
- Anonymous user attempting any private write.
- Privileged service-role endpoints accidentally exposed to a public browser.

## Release phases

1. v0.3: demo-only reviewer contract and unit tests — **implemented, no backend**.
2. v0.4: dedicated tenant DB provisioning, locked-down schema, DB-based RLS adversarial tests — awaiting selected organization and project.
3. v0.5: secure authentication and protected read-only operator/reviewer workflow.
4. v0.6+: gated evidence upload, transactional review approvals, audit reconciliation and conditional publication.

Legal and jurisdictional review must precede any real financial participation, investment or token features.

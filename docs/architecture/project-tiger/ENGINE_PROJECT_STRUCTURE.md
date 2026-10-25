# TIGER Operating Model — Twenty Independent Engine Workspaces
**Status:** proposed organization and engineering governance; real GitHub Projects boards and dedicated repositories are not yet provisioned.

## Why separate Projects and repository boundaries matter
**GitHub Projects** are planning boards. A GitHub Project does **not** separate source code, runtime, secrets, data or CI. Therefore use **one GitHub Projects v2 board per engine plus one portfolio board**, and independently enforced **engine source/build/runtime interfaces**.

The connected account `pcrus1988-bit` currently owns the `buylocalsparta` monorepo. No GitHub organization was visible when drafting this plan. A dedicated GitHub organization (recommended name `konta-moy`, if available and approved) would improve repository ownership, team permissions, and project governance, but the design works initially under a personal account.

## Proposed structure
```
TIGER — KONTA MOY 2.0 Portfolio (GitHub Project)
├── TIGER E01 — Identity & Accounts (GitHub Project)
├── ... one GitHub Project for every E02–E19 ...
└── TIGER E20 — Analytics & Intelligence (GitHub Project)

Code target, gradually:
├── tiger-identity
├── tiger-providers
├── ... one independently governed engine code repository per engine ...
├── tiger-analytics-intelligence
├── tiger-contracts     (IDL/JSON schemas/SDK interfaces only)
└── tiger-connectors    (engine-to-engine and external provider integration adapters)
```
The 20 separate code repos are a **target**, not a mandate to rip stable logic out of the current monorepo immediately. Where reliable business logic already exists, start with a narrowly bounded package and independent tests, wrap it with a stable contract, and migrate only after behavior/tenant/payment/fiscal parity and recovery tests are proven.

## What engine independence actually means
**Standalone-capable:** own data store boundary, bounded business domain, no synchronous dependency on another engine to execute its native rules against valid inputs, independent CI, independently documented versioned API. Domain examples:
- Booking confirms/reschedules/cancels **booking records** against verified resource reservation port; it does not process card payments or create tax documents.
- Payments reconciles against PSP-confirmed actual outcomes; it does not need a marketplace order in order to reconcile a legally authorized payment.
- FISCAL accepts properly authorized fiscal commands and validates issuer/document lifecycle; it does not infer a payment from the existence of an order.
- Search can respond from its own authorized projection; when its source data are unavailable, it reports snapshot age rather than inventing offers or live availability.
- Orchestrator handles durable workflow transitions through connector ports; it does not embed Booking, Payments or FISCAL business rules.

**Not magic independence:** cryptography, networking, PostgreSQL and shared identity primitives are legitimate platform dependencies. Some end-user workflows require multiple engines; when an authoritative engine is down, the composite workflow must defer or fail safely. No subsystem should claim a confirmed action it did not authoritatively verify.

## Per-engine GitHub Project configuration
Recommended layout: board, table, roadmap; all the same fields for global aggregation.

- Columns: Backlog -> Specified -> In Development -> Code Review -> Contract Tested -> Staging Verified -> Production Verified; plus Blocked.
- Fields: Priority (P0-P3), Workstream, Owner, Maturity, Risk, Integration dependency, Evidence URL and Release version.
- Views: Core; Security & Compliance; Dependencies; Release Readiness; Bugs/Incidents.
- Avoid claiming `Production Verified` without live evidence and rollback plan.

Each engine gets exactly these initial deliverables:
1. Domain charter: responsibility, **explicit non-responsibilities**, acceptance cases.
2. Authoritative data model and ownership, tenant strategy, migrations.
3. Versioned command/query API with schema validation, identity/scopes, errors and idempotency.
4. Events with versions, outbox/inbox and compensating transitions.
5. Standalone CI + local production-shaped integration test; no hidden imports.
6. Observability, alerts, retention, backup/restore evidence and failure modes.
7. External and cross-engine connector registration and signed contract tests.
8. Stage/live verification artifacts and manual activation gate when regulated.

## Definition of Done — independently operational engine
All eight deliverables complete; fail-closed security, data ownership and tenant boundaries verified; input validation and idempotency verified; load/concurrency/recovery evidence where relevant; all required cross-engine **contracts** accepted; rollback and monitoring ready; real provider/regulatory checks done where required.

**Standalone smoke test passing is not sufficient for release.** In production a dependent customer journey needs all critical connectors verified.

## Rollout in order
**First:** TIGER-0 baseline and ownership/evidence inventory, then Identity, Provider, Catalogue, Availability, Booking and the Connector Standard.  
**Second:** Quotes, Orders, Payment, FISCAL, Fulfilment and Communication.  
**Third:** Discovery/Intent, Intelligence, and expanded sector integrations.  
Cross-cutting Governance, Orchestration, Security and Integration Gateway start during TIGER-0 and remain active throughout.

See `engine-projects.v0.json` for every future board title, owner scope and individual acceptance target. See `CONNECTOR_STANDARD.md` for permitted interaction boundaries.

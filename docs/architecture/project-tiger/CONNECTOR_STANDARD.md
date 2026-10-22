# TIGER Connector Standard 0.1 — Composable Engines Without Shared Business Logic
**Status:** design-only; no connector is activated by this file.

## Principle
An engine knows its business, not the internals of another engine. Cooperation happens through a separately owned, explicit and versioned **connector**. Business engine repositories must not import other business engines or manipulate their databases.

## Standard connector record
```json
{
  "id": "booking-to-payments",
  "version": "1.0.0",
  "source_engine": "E07",
  "destination_engine": "E10",
  "transport": "authenticated_https",
  "trigger": "deposit_required",
  "request_contract": "booking.deposit_requested.v1",
  "response_contract": "payment.intent_created.v1",
  "permissions": ["deposit:request"],
  "timeout_ms": 5000,
  "retry_policy": "bounded_and_idempotent",
  "failure_mode": "booking_remains_pending_payment",
  "audit": "correlation + business event IDs",
  "activation": "disabled_until_contract_tested"
}
```

## Transport decisions
- **Synchronous command** (REST/gRPC) when caller requires an immediate authoritative answer (e.g. obtain a slot hold or verified quote).
- **Asynchronous domain event** (transactional outbox/consumer inbox) when one engine reports a fact others may react to (e.g. booking.confirmed, payment.captured, fulfilment.completed).
- All events are at least once; consumer deduplicates by event ID and operation key.
- No cross-engine 2-phase database commit; orchestration uses durable sagas, explicit timeouts and compensations.
- Only the authoritative owning engine can emit an operational **confirmed** status.

## Security, resilience and privacy
- Scoped service-to-service identity (mTLS or verified signed token), least-privilege claims, tenant/business/legal-entity scope and versioned schema allowlists.
- Anti-replay, idempotency key, request timestamps, nonces where needed, HMAC/PSP signature verification at ingress.
- Circuit breakers, bounded retries, dead-letter queues and safe reconciliation after ambiguous provider responses.
- No secrets/taxpayer identifiers/payment cards or health data in broad event buses or log payloads.
- Discovery/AI never issue final authorizations; the receiving engine validates everything.
- Explicit version compatibility and deprecation periods; compatibility contract tests run in CI and staging.
- Distinguish contract person/provider/legal seller, PSP merchant/settlement beneficiary and legal fiscal issuer.

## Connector approval states
`proposed -> specified -> contract_tested -> staging_verified -> production_verified -> deprecated`.

No shortcut from `specified` to `production_verified` and no connector enabled in production without reciprocal owner sign-off and recorded verification evidence.

## First connector catalogue (proposed)
| Connector | Trigger | Outcome | Safe failure |
|---|---|---|---|
| E03 -> E04 Catalogue to Search | approved offering changed | search index projection | old projection flagged as stale |
| E05 -> E07 Eligibility to Booking | booking requested | eligibility decision | booking rejected or pending |
| E06 -> E07 Availability to Booking | slot requested | atomic resource hold | no confirmation |
| E07 -> E08 Booking to Pricing | pricing required | locked estimate / price snapshot | booking pending |
| E07 -> E10 Booking to Payments | prepayment/deposit policy | PSP intent and verified payment | booking pending; hold expires/compensates |
| E10 -> E11 Payments to FISCAL | legally relevant event | issuer/document request after applicable policy resolution | fiscal reconciliation required; never duplicate |
| E09 -> E12 Order to Fulfilment | accepted commitment | auditable fulfilment job | pending fulfilment |
| E07 -> E13 Booking to Communications | status changed | deduped confirmation message | retry notification; booking unchanged |
| E15 -> E07/E09/E10 Workflow to engines | saga command | verified transition | explicit timeout/reconciliation |
| E16 -> external PSP/calendar/POS/AADE | provider-specific API | authenticated mapped event | fail closed and reconcile |

## Independent local smoke vs integrated acceptance
- **Engine tests** use isolated fixtures/contract fakes to validate **only engine domain logic**. No fake is deployed to production and no smoke can claim real payment/fiscal/booking activation.
- **Connector tests** use both sides' latest published schemas and reject breaking incompatibility.
- **End-to-end staging** uses authenticated real dependencies and adverse/failure scenarios.
- **Production release** requires verified live processor/provider scope and legal/regulatory approval where relevant, real monitoring, rollback and recorded evidence.

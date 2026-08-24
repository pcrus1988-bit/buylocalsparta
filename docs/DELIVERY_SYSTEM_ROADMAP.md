# KONTA MOU Delivery System Roadmap

Status: implementation roadmap for the cooperating Sparta delivery-service layer.

This roadmap is intentionally additive to `0138_delivery_partner_operations.sql`. The existing delivery partner, driver, job, stop, immutable event and sampled GPS tables remain the operational foundation.

## Operating principles

1. A customer order or return is represented as one delivery job with one or more constrained stops.
2. Multi-vendor outbound jobs preserve pickup-before-customer precedence. Returns preserve customer-pickup-before-vendor-return precedence.
3. Every meaningful state transition is auditable and idempotent.
4. The dispatcher is software, not a human dispatcher. Humans govern exceptions, overrides and Red Mode.
5. Assignment optimizes **marginal route cost**, not nearest-driver distance.
6. Hard constraints always beat optimization: capacity, shift, stop precedence, time windows, manual locks, legal/operational limits and delivery promises.
7. Immediate stops can be locked, accepted work is committed, and only the flexible suffix is freely re-optimized.
8. Customer tracking reveals operational progress without exposing unrelated customer/vendor movements.
9. Frequent live GPS state belongs in a hot/ephemeral store; PostgreSQL keeps sampled/auditable points instead of a write every few seconds.
10. Red Mode is never automatically enabled. It requires dual human approval: one Admin and one Delivery Manager.

## Daily dispatch lifecycle — Europe/Athens

### Before 07:45 — collection
- Out-of-hours orders and returns accumulate as unplanned delivery jobs.
- Capacity and availability for the coming shift can be forecast.
- No morning route is considered final.

### 07:45–08:00 — morning draft
- The dispatcher builds routes for every available scheduled driver simultaneously.
- A driver can begin with zero, one or many jobs.
- Jobs are grouped by vendor, geographic direction, stop compatibility and delivery promise.
- Driver workload and difficult/far-route history contribute to fairness scoring.
- Shortage/delay risks are forecast before freeze.

### 08:00 — freeze
- Morning plans are frozen and versioned.
- The immediate next stop is locked; accepted route work becomes committed.
- The route remains re-plannable only where constraints allow.

### 08:01 onward — adaptive add-ons
- New orders/returns are evaluated as insertion candidates against every feasible active driver route.
- Orders placed between 07:45 and 08:00 are treated as post-freeze add-ons rather than destabilizing the morning draft.
- Cheapest-feasible insertion is based on incremental time, distance, fuel/energy, SLA risk, direction, capacity, workload and fairness.
- Opportunity pickups can be proposed when a driver will pass near a vendor at very low marginal cost.

## Phase 0 — schema and governance foundation

Deliverables:
- Vehicle and capacity profiles.
- Driver shift/availability state.
- Route mutability (`locked`, `committed`, `flexible`).
- Per-market dispatcher settings and scoring weights.
- Daily plan and versioned route-plan records.
- Candidate offers and immutable dispatch-decision audit.
- Scoped one-time QR claims.
- Demand/shortage forecast records.
- Delivery Manager membership.
- Auditable manager actions.
- Dual-approval Red Mode guardrails.

Acceptance:
- Existing `0138` rows remain valid.
- Public/anon/authenticated/service-role access remains denied; server runtime roles retain access.
- A `red_mode` route cannot be inserted without a currently approved Red Mode request.
- Dispatch-decision, Red Mode approval and manager-action audit rows are append-only.

## Phase 1 — operational driver V1

Deliverables:
- Dedicated `/delivery` driver surface and driver-session authentication.
- Shift start/end, available/busy/paused/unavailable state.
- Route list, next stop and stop detail.
- QR scanner for vendor pickup, customer delivery, customer return pickup and vendor return receipt.
- Multi-location root pickup token with stop-scoped consumable claims.
- Accept/decline assignment offers.
- Offline-safe action queue with idempotency keys.
- Navigation launch from the current stop.

Acceptance:
- Multi-vendor pickup progress can complete independently.
- Duplicate scans cannot complete a stop twice.
- A lost/retried network request does not duplicate delivery events.
- Driver never sees unrelated customer data.

## Phase 2 — customer/admin tracking

Deliverables:
- Customer delivery tracking timeline with partial pickup milestones and timestamps.
- ETA and stage updates.
- Exact driver position shown only on the final customer leg or inside a configured privacy threshold.
- Admin delivery control-tower view for active drivers/jobs/routes/delays/history.
- Manual reassignment/lock/priority actions with reason and audit record.

Acceptance:
- Customer can see Vendor A/Vendor B completed while Vendor C remains pending.
- Admin sees the full operational timeline and current route version.
- Historical route/assignment rationale is reconstructable.

## Phase 3 — adaptive dispatch engine

Deliverables:
- Candidate filtering: on-shift, fresh location, accepting work, vehicle/capacity, permissions, time windows and duty constraints.
- Cheapest-feasible ordered-stop insertion into the flexible route suffix.
- Scoring of incremental travel time, distance, fuel/energy, lateness/SLA risk, stop delay, direction, capacity utilization, workload and fairness.
- Bonuses for co-located/vendor-cluster stops and route-aligned opportunity pickups.
- Driver accept/decline; declined offers fall through to next-best candidate.
- Re-plan triggers for new jobs, completed/failed stops, unavailable driver, meaningful deviation and routing/ETA change.

Acceptance:
- A farther driver already travelling in the correct direction may beat a nearer driver heading away.
- Locked stops never move through automatic optimization.
- Existing committed promises cannot be worsened beyond configured detour/SLA thresholds.
- Every candidate rejection and chosen score is auditable.

## Phase 4 — routing/live-location infrastructure

Deliverables:
- Routing provider abstraction for road distance, travel time, geometry and matrix queries.
- Hot current-driver state with TTL in Redis-compatible storage.
- Adaptive heartbeat cadence: active route > idle > stationary/off-shift.
- Sampled PostgreSQL history only for meaningful/auditable points.
- Route version propagation to driver/customer/admin surfaces.

Acceptance:
- Current-state reads do not require scanning location history.
- Supabase/PostgreSQL is not hammered by raw GPS writes every few seconds.
- Stale locations are explicitly identified and excluded or penalized.

## Phase 5 — fairness, forecasting and next-best action

Deliverables:
- Daily/weekly workload ledger including difficult/far assignments, distance, active minutes and route burden.
- Fairness contribution in dispatch scoring without violating hard service constraints.
- Demand forecast by date/time bucket/zone plus available driver/capacity forecast.
- Delay/shortage risk levels with machine-generated next-best actions.
- Suggested customer-delay notification is created as an Admin action; the dispatcher does not directly message customers.
- Critical cases escalate to the control tower for human routing.

Acceptance:
- Far/difficult work rotates over time where alternatives are feasible.
- Forecast explains why capacity is expected to be short.
- Suggested actions include measurable impact and do not silently execute high-impact exceptions.

## Phase 6 — Red Mode / critical operations

Deliverables:
- Admin requests Red Mode with reason, scope and expiry.
- Delivery Manager independently approves; Admin and Delivery Manager must be separate users.
- Approved request is time-bounded and auditable.
- Red Mode route plans explicitly reference the approval request.
- Manual critical reassignment and overrides require reason codes.
- Close/revoke path immediately prevents new Red Mode route plans.

Acceptance:
- Algorithm cannot self-approve Red Mode.
- Driver cannot approve Red Mode.
- One human cannot satisfy both approvals.
- `red_mode` route insert is rejected at database level unless dual approval is valid.

## Phase 7 — hardening and production readiness

Deliverables:
- Concurrency/idempotency tests for scans, offers, assignment and re-planning.
- Route optimizer simulation across multiple drivers and multi-stop jobs.
- Privacy/access tests for customer/driver/vendor/admin scopes.
- Offline/reconnect tests.
- Observability for stale drivers, route churn, rejected insertions, late stops and forecast misses.
- Retention jobs for sampled location history and expired tokens.
- Routing-provider fallback/degraded mode.
- Battery/data-safe mobile tracking behavior.

Acceptance:
- Repeated events are safe.
- Route churn remains bounded.
- Sensitive cross-customer location data is not exposed.
- Dispatch can degrade safely if routing or live-location services are unavailable.

## Dispatch score contract

The default score is a weighted incremental cost, not a global straight-line distance:

`score = time + distance + fuel + SLA risk + stop delay + capacity + direction + workload + fairness - clustering/opportunity bonuses`

Weights and thresholds are market-configurable and snapshotted into each dispatch decision so later audits reproduce why a driver was selected.

## Route mutation contract

- **Locked**: immediate/actively navigated stop. Automatic optimizer cannot move it.
- **Committed**: accepted/promised work. Re-order only inside configured constraints.
- **Flexible**: optimizer may re-sequence freely if precedence/time-window rules remain satisfied.

A new job is inserted only if all hard constraints remain feasible. Otherwise the next candidate is evaluated or an exception/shortage action is generated.

## QR/proof contract

- A delivery job can have a root proof group.
- Each physical stop has its own hashed, scoped claim.
- Vendor pickup claims are consumed only by their matching vendor/location stop.
- Customer delivery proof is customer-presented and one-time.
- Return pickup proof is customer-presented and one-time.
- Vendor return receipt proof is vendor-presented and one-time.
- Raw tokens are never stored; only hashes are persisted.
- Consumption is idempotent and always emits an immutable delivery event.

## Privacy contract for live tracking

- Admin/authorized delivery operations can access full active operational location subject to retention controls.
- Drivers receive only route/customer information required for their assigned work.
- Customers receive milestone/ETA tracking throughout the job.
- Precise driver map position is withheld while the route would reveal unrelated stops and becomes eligible only on the final customer leg or within the configured proximity/time threshold.

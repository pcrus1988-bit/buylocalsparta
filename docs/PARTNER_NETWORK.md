# KONTA MOY Partner Network

## Purpose

The Partner Network is a Greece-wide performance acquisition channel for real KONTA MOY vendors. It deliberately avoids recruitment-derived compensation: joining as a Partner is free and creating/sponsoring another Partner produces no commission event by itself.

The program is capped at three earning levels and integrates with the existing `users`, `vendor_businesses`, `markets` and HUB runtime rather than creating a second vendor or geography model.

## Approved commercial policy

| Revenue event | Level 1 | Level 2 | Level 3 | Notes |
| --- | ---: | ---: | ---: | --- |
| Vendor activation fee | 30% | 7% | 3% | Cleared eligible activation revenue |
| Vendor subscription | 18% | 5% | 2% | Months 1–24 |
| KONTA MOY marketplace commission revenue | 5% | 1.5% | 0.5% | Base is KONTA MOY fee revenue, **never GMV** |
| Direct renewal after month 24 | 5% | — | — | Direct relationship only |

Current vendor-plan snapshot used for examples/UI:

| Plan | Activation | Monthly | Annual | Platform commission |
| --- | ---: | ---: | ---: | ---: |
| CLAIM | €0 | €0 | €0 | 0% |
| PRESENCE | €49 | €9.90 | €99 | 0% |
| SHOP | €149 | €19 | €190 | 8% |
| GROWTH | €299 | €39 | €390 | 5% |
| PRO | €499 | €99 | €990 | 3% |

The commission ledger snapshots plan code/name/cadence on each financial event. It does **not** foreign-key historical earnings to old subscription-plan rows, so plan changes do not rewrite historical economics.

## Attribution

1. Partner shares `/refer/{PARTNER_CODE}` or a QR code containing that URL.
2. The referral route normalizes the code and stores an HTTP-only, SameSite=Lax referral cookie for up to 180 days.
3. The cookie is only a lead signal. It never creates commission by itself.
4. During vendor claim/application creation, the backend validates the Partner code and creates a `partner_attributions` row.
5. Only one active attribution may exist for a vendor or pre-vendor subject key.
6. When the verified business converts, the earning hierarchy is snapshotted into L1/L2/L3 on the attribution. Future sponsor changes cannot rewrite that vendor's historical earning path.
7. Expired/void attributions do not earn.

CLAIM remains a €0 acquisition path: no commission is generated until an eligible paid plan/revenue event occurs while a valid attribution exists.

## Partner hierarchy and ranks

- **PARTNER** — Level 1; free enrollment.
- **TEAM_PARTNER** — 5 personally acquired active paid vendors; unlocks Level 2.
- **AREA_PARTNER** — 15 personally acquired active paid vendors + 50 active paid team vendors + 80% retention floor; unlocks Level 3.
- **HUB_PARTNER** — same minimum performance floor plus manual commercial/HUB approval.

Rank changes should be recorded in `partner_rank_history`; never infer historic earning eligibility from the Partner's current rank alone.

## Monthly accelerator

The highest achieved tier applies once; tiers are non-cumulative:

- 5 verified paid new vendors → €50
- 10 → €150
- 25 → €400
- 50 → €1,000
- 100 → €2,500

Refunded, chargeback, duplicate, related-party-abuse and unverified vendors do not count.

## Financial event contract

`partner_commission_events` is the auditable earning ledger. Each source event must provide a unique `idempotency_key`, preventing duplicate earnings when a payment/order webhook is retried.

### Activation

When an eligible vendor activation payment reaches the platform's cleared state:

- base = cleared activation revenue in cents;
- create eligible L1/L2/L3 events from the conversion snapshot;
- apply the effective `ACTIVATION` rule for each unlocked level;
- start in HOLD until the configured refund/clearance window passes.

### Subscription

When a monthly/annual subscription payment clears:

- base = cleared subscription revenue in cents;
- months 1–24 use the `SUBSCRIPTION` rules;
- after month 24 only the eligible direct relationship may use `DIRECT_RENEWAL`;
- snapshot plan code/name and cadence.

### Marketplace transaction

When KONTA MOY recognizes its marketplace commission for an eligible order:

1. Calculate platform fee revenue first (for example, €10,000 SHOP GMV × 8% = €800 KONTA MOY revenue).
2. Pass **€800**, not €10,000, as `base_amount_cents` for `PLATFORM_COMMISSION`.
3. L1 at 5% therefore earns €40; L2 at 1.5% earns €12; L3 at 0.5% earns €4.

### Refund / chargeback

Never edit the original earning amount. Add a negative `CLAWBACK` event referencing the original event, then move the original/current settlement state as appropriate. The database trigger prevents changing the core financial fields of an existing commission event or deleting it.

## Payout lifecycle

`HOLD → PAYABLE → PAID`

1. Eligible cleared revenue creates HOLD commission events.
2. After the configured hold window and fraud/refund checks, an operator/job promotes events to PAYABLE.
3. A payout groups payable events into `partner_payout_items`.
4. Payout moves `DRAFT → APPROVED → PROCESSING → PAID` (or FAILED/VOID).
5. One commission event can belong to only one payout.

Automatic money movement must remain disabled until Partner contractual terms, KYC/payee identity, tax/invoicing treatment and the payout provider flow are approved.

## Anti-fraud / anti-pyramid invariants

- €0 Partner enrollment fee.
- €0 recruitment commission.
- No mandatory starter kit, training purchase or minimum purchase.
- Maximum three earning levels.
- Compensation is triggered only by real vendor revenue/performance events.
- One active attribution per vendor/pre-vendor subject.
- Existing attribution cannot be replaced by a later cookie.
- Verified business identity should use the existing ΓΕΜΗ/ΑΦΜ verification workflow before payout eligibility.
- Related-party/self-referral patterns require review.
- Refunds and chargebacks claw back the matching commission.
- Earnings marketing must not promise or imply guaranteed income.
- HUB Partner is a governed commercial role, not a purchasable rank.

## Geography / HUB integration

Partner accounts reference the existing `markets` table through `home_market_id` and `partner_market_assignments`. HUB logic stays in the established HUB/market gateway; the Partner Network must not introduce an independent city registry.

A Partner may have a primary market plus secondary/HUB assignments. Territory assignment affects workflow/reporting, not ownership of vendors/orders.

## Integration points still required before launch

The foundation schema and read-only portals are not permission to start paying commissions. Before production launch wire these governed event producers:

- vendor application/claim → validated attribution creation;
- vendor activation payment settled → activation commission events;
- subscription payment settled → subscription/direct-renewal commission events;
- marketplace platform fee recognized → platform-commission events;
- refund/chargeback → clawback event;
- monthly rank recalculation and non-cumulative bonus evaluation;
- hold-expiry/fraud job → PAYABLE transition;
- approved payout provider/accounting flow → PAID settlement.

The current `/refer/[code]` route captures the referral signal only. Public Partner self-enrollment should be enabled only after the Partner terms version and payout/KYC workflow are approved.

## Test cases

Minimum acceptance tests for the financial engine:

- PRO €499 activation: L1 €149.70, L2 €34.93, L3 €14.97.
- PRO €990 annual subscription: L1 €178.20, L2 €49.50, L3 €19.80.
- SHOP €10,000 GMV → €800 platform fee → L1 €40, L2 €12, L3 €4.
- CLAIM produces €0 until a paid eligible event exists.
- 10 paid new vendors in one month produces €150 (not €200 cumulative).
- duplicate source/webhook with the same idempotency key cannot create a second commission event.
- later referral cookie cannot replace an active attribution.
- refund creates a negative clawback; original financial event remains immutable.
- sponsor changes after conversion do not alter the snapshotted L1/L2/L3 path.
- no database event type exists for recruitment commission.

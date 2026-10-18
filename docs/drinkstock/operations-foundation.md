# DrinkStock operational domain — October 2026
This is the first persistent data-model foundation. It **does not enable charging, guest order submission, kitchen dispatch or receipt issuance**.

## Key invariants
- Multi-tenancy: every venue belongs to exactly one partner, using composite venue/partner FK. All server-side reads require verified membership, except narrowly scoped opaque public screen/table passes.
- Sessions are unique per venue (only one non-ended session). A session snapshots pricing bounds and has scheduled → running ↔ paused; running → crashing for 60 seconds → running; any active state → ended. Ended sessions cannot reopen.
- A token grants only its specific screen or table visibility, never manager access. Store SHA-256 hashes, not raw token values. Rotate/revoke per venue. Users from other locations can open HTTPS public screen URLs, but the screen does not expose manager controls or customer data.
- A printed table QR is bound to a single venue/table and requires a running session for orders; QR reuse does not grant access to other venues. Expire or revoke compromised tokens.
- Monetary prices are immutable integer-cent snapshots at order acceptance, not subsequently recalculated when the trading board moves. A quote has a 15-second acceptance window; expiration requires customer reconfirmation.
- Fulfilment: awaiting_payment → paid → accepted → preparing → ready → served. Never dispense based on unverified browser payment state. Payment provider webhooks are verified and idempotent.
- Fiscal: the registered hospitality merchant is seller of record. Classify VAT per item and service type, with venue-specific statutory tax rules reviewed by an accountant. Receipts must come from a legally authorized Greek retail fiscal device/provider; a payment success notification is not a fiscal receipt. Issue/credit with unique external references and reconcile failures.
- Refunds must not erase the original receipt. Corresponding credit documents and payment refunds are tracked separately.
- The demo trading feed must never be used as an input to billing or accounting.
- All writes require venue scoping, idempotency keys, authorization, row locks, and auditable state transitions.

## Activation gates
1. Apply version 0451 to production through the existing versioned schema deployment process; keep the schema ledger and SHA checksums in sync.
2. Implement authenticated manager controls, QR/screen token lifecycle, public scoped readers, and transactionally locked session actions.
3. Choose and configure a regulated PSP with signature-verified webhooks, secure tokenized payment collection, refunds, and merchant settlement.
4. Connect the approved Greek fiscal receipt mechanism/provider, verify VAT policy and service context, and test receipt/credit reconciliation.
5. Run concurrent cross-tenant, fake-payment, price-change, crash-window, token-revocation, and duplicate-webhook tests before enabling real guest checkout.

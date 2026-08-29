import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type GiftCardView = Readonly<{
  id: string;
  suffix: string;
  status: string;
  initialValueMinor: number;
  balanceMinor: number;
  currency: "EUR";
  recipientName?: string;
  message?: string;
  issuedAt: number;
  expiresAt?: number;
}>;

export type GiftCardIssueResult = Readonly<{ card: GiftCardView; code: string }>;
export type GiftCardRedemptionResult = Readonly<{
  card: GiftCardView;
  orderId: string;
  amountMinor: number;
  merchandiseEligibleMinor: number;
  deliveryMinor: number;
  remainingPayableMinor: number;
  paymentComplete: boolean;
}>;

export class GiftCardRemainderBelowMinimumError extends Error {
  readonly code = "PAYMENT_REMAINDER_BELOW_MINIMUM";
  readonly remainingMinor: number;
  readonly minimumMinor: number;

  constructor(remainingMinor: number, minimumMinor: number) {
    super(`Μετά τη δωροκάρτα απομένουν ${(remainingMinor / 100).toFixed(2)} € για online πληρωμή, κάτω από το ελάχιστο ποσό ${(minimumMinor / 100).toFixed(2)} €.`);
    this.name = "GiftCardRemainderBelowMinimumError";
    this.remainingMinor = remainingMinor;
    this.minimumMinor = minimumMinor;
  }
}

const PAID_RESERVATION_HOLD_MS = 48 * 60 * 60 * 1000;

function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 }); }
function pepper() { const value = process.env.GIFT_CARD_CODE_PEPPER?.trim(); if (!value || value.length < 32) throw new Error("GIFT_CARD_CODE_PEPPER must be configured with at least 32 characters"); return value; }
function codeHash(code: string) { return createHmac("sha256", pepper()).update(normalizeCode(code)).digest("hex"); }
function normalizeCode(code: string) { return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function makeCode() { const raw = randomBytes(15).toString("hex").toUpperCase(); return `KM-${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 18)}-${raw.slice(18, 24)}`; }
function asInt(value: unknown) { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error("Invalid gift-card amount"); return n; }
function epoch(value: unknown) { if (!value) return undefined; const n = new Date(String(value)).getTime(); return Number.isFinite(n) ? n : undefined; }
function rowView(row: SqlRow): GiftCardView { return { id: String(row.public_id), suffix: String(row.code_suffix), status: String(row.status), initialValueMinor: asInt(row.initial_value_minor), balanceMinor: asInt(row.balance_minor), currency: "EUR", recipientName: typeof row.recipient_name === "string" ? row.recipient_name : undefined, message: typeof row.message === "string" ? row.message : undefined, issuedAt: epoch(row.issued_at) ?? 0, expiresAt: epoch(row.expires_at) }; }

export function giftCardsLiveEnabled() { return process.env.GIFT_CARDS_LIVE_ENABLED === "true"; }

export async function customerGiftCards(principal: SessionPrincipal): Promise<readonly GiftCardView[]> {
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT gc.* FROM gift_cards gc JOIN users u ON u.id=gc.holder_user_id WHERE u.public_id=$1 ORDER BY gc.created_at DESC`, [principal.userId]);
    return result.rows.map(rowView);
  }, { readOnly: true });
}

export async function claimGiftCard(principal: SessionPrincipal, rawCode: string): Promise<GiftCardView> {
  if (!productionDatabaseConfigured()) throw new Error("Gift cards require the production database");
  const normalized = normalizeCode(rawCode);
  if (normalized.length < 20 || normalized.length > 40) throw new Error("Ο κωδικός δωροκάρτας δεν είναι έγκυρος");
  const hash = codeHash(normalized);
  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const user = await tx.query<SqlRow>(`SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1`, [principal.userId]);
    if (!user.rowCount) throw new Error("Customer account was not found");
    const locked = await tx.query<SqlRow>(`SELECT * FROM gift_cards WHERE code_hash=$1 FOR UPDATE`, [hash]);
    if (!locked.rowCount) throw new Error("Η δωροκάρτα δεν βρέθηκε");
    const card = locked.rows[0];
    if (!["active", "depleted"].includes(String(card.status))) throw new Error("Η δωροκάρτα δεν είναι διαθέσιμη για σύνδεση");
    if (card.expires_at && new Date(String(card.expires_at)).getTime() <= Date.now()) throw new Error("Η δωροκάρτα έχει λήξει");
    if (card.holder_user_id && String(card.holder_user_id) !== String(user.rows[0].id)) throw new Error("Η δωροκάρτα έχει ήδη συνδεθεί με άλλο λογαριασμό");
    const updated = await tx.query<SqlRow>(`UPDATE gift_cards SET holder_user_id=$2::uuid,activated_at=COALESCE(activated_at,now()),updated_at=now() WHERE id=$1::uuid RETURNING *`, [card.id, user.rows[0].id]);
    return rowView(updated.rows[0]);
  }, { isolation: "serializable" });
}

export async function redeemGiftCardForOrder(principal: SessionPrincipal, input: { giftCardId: string; orderId: string; minimumExternalPaymentMinor?: number; now?: number }): Promise<GiftCardRedemptionResult> {
  if (!productionDatabaseConfigured()) throw new Error("Gift cards require the production database");
  if (!input.giftCardId.trim() || !input.orderId.trim()) throw new Error("Gift card and order are required");
  const minimumExternalPaymentMinor = input.minimumExternalPaymentMinor ?? 0;
  if (!Number.isSafeInteger(minimumExternalPaymentMinor) || minimumExternalPaymentMinor < 0) throw new Error("Invalid minimum external payment amount");
  const now = input.now ?? Date.now();
  const idempotencyKey = `checkout-redeem:${input.orderId}:${input.giftCardId}`;
  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const user = await tx.query<SqlRow>(`SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1`, [principal.userId]);
    if (!user.rowCount) throw new Error("Customer account was not found");
    const userUuid = String(user.rows[0].id);

    const orderResult = await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid,o.public_id AS order_public_id,o.market_id::text AS market_uuid,o.user_id::text AS user_uuid,o.status::text AS order_status,o.currency,
      o.subtotal_minor,o.shipping_minor,o.discount_minor,o.total_minor,
      p.id::text AS payment_uuid,p.provider,p.provider_order_code,p.status::text AS payment_status
      FROM customer_orders o JOIN payments p ON p.order_id=o.id WHERE o.public_id=$1 FOR UPDATE OF o,p`, [input.orderId]);
    if (!orderResult.rowCount) throw new Error("Η παραγγελία δεν βρέθηκε");
    const order = orderResult.rows[0];
    if (String(order.user_uuid) !== userUuid) throw new Error("Η παραγγελία δεν ανήκει στον λογαριασμό σου");
    if (String(order.currency) !== "EUR") throw new Error("Η δωροκάρτα μπορεί να χρησιμοποιηθεί μόνο σε παραγγελίες EUR");

    const totalMinor = asInt(order.total_minor);
    const subtotalMinor = asInt(order.subtotal_minor);
    const deliveryMinor = asInt(order.shipping_minor);
    const discountMinor = asInt(order.discount_minor);
    const merchandiseEligibleMinor = Math.max(0, subtotalMinor - discountMinor);

    const cardResult = await tx.query<SqlRow>(`SELECT * FROM gift_cards WHERE public_id=$1 FOR UPDATE`, [input.giftCardId]);
    if (!cardResult.rowCount) throw new Error("Η δωροκάρτα δεν βρέθηκε");
    const card = cardResult.rows[0];
    if (String(card.market_id) !== String(order.market_uuid)) throw new Error("Η δωροκάρτα δεν ισχύει για αυτή την αγορά");
    if (String(card.holder_user_id ?? "") !== userUuid) throw new Error("Σύνδεσε πρώτα τη δωροκάρτα με τον λογαριασμό σου");

    const prior = await tx.query<SqlRow>(`SELECT amount_minor FROM gift_card_ledger WHERE idempotency_key=$1 LIMIT 1`, [idempotencyKey]);
    if (prior.rowCount) {
      const amountMinor = Math.abs(asInt(prior.rows[0].amount_minor));
      const remainingPayableMinor = Math.max(0, totalMinor - amountMinor);
      return { card: rowView(card), orderId: input.orderId, amountMinor, merchandiseEligibleMinor, deliveryMinor, remainingPayableMinor, paymentComplete: remainingPayableMinor === 0 };
    }

    if (String(order.order_status) !== "pending_payment") throw new Error("Η παραγγελία δεν είναι πλέον σε αναμονή πληρωμής");
    if (String(order.provider) !== "pending_psp" || order.provider_order_code || !["created", "failed"].includes(String(order.payment_status))) throw new Error("Η πληρωμή της παραγγελίας έχει ήδη ξεκινήσει με άλλο τρόπο");
    if (String(card.status) !== "active") throw new Error("Η δωροκάρτα δεν είναι ενεργή");
    if (card.expires_at && new Date(String(card.expires_at)).getTime() <= now) throw new Error("Η δωροκάρτα έχει λήξει");
    if (totalMinor <= 0) throw new Error("Η παραγγελία δεν έχει έγκυρο τελικό ποσό");

    const balanceMinor = asInt(card.balance_minor);
    const amountMinor = Math.min(balanceMinor, merchandiseEligibleMinor);
    if (amountMinor <= 0) throw new Error("Η δωροκάρτα εφαρμόζεται μόνο στην αξία των προϊόντων και όχι στα έξοδα παράδοσης.");

    const remainingPayableMinor = Math.max(0, totalMinor - amountMinor);
    if (remainingPayableMinor > 0 && remainingPayableMinor < minimumExternalPaymentMinor) {
      throw new GiftCardRemainderBelowMinimumError(remainingPayableMinor, minimumExternalPaymentMinor);
    }

    const alreadyRedeemed = await tx.query<SqlRow>(`SELECT 1 AS hit FROM gift_card_ledger WHERE order_public_id=$1 AND entry_type='redeem' LIMIT 1`, [input.orderId]);
    if (alreadyRedeemed.rowCount) throw new Error("Η παραγγελία έχει ήδη χρησιμοποιήσει δωροκάρτα");

    const nextBalance = balanceMinor - amountMinor;
    const ledgerPublicId = `gift_ledger_${randomUUID()}`;
    const updatedCard = await tx.query<SqlRow>(`UPDATE gift_cards SET balance_minor=$2,status=CASE WHEN $2=0 THEN 'depleted' ELSE 'active' END,updated_at=$3 WHERE id=$1::uuid RETURNING *`, [card.id, nextBalance, new Date(now)]);
    await tx.query(`INSERT INTO gift_card_ledger(public_id,gift_card_id,entry_type,amount_minor,balance_after_minor,currency,idempotency_key,order_public_id,actor_user_id,reason,metadata,created_at)
      VALUES($1,$2::uuid,'redeem',$3,$4,'EUR',$5,$6,$7::uuid,'checkout_redemption',$8::jsonb,$9)`, [ledgerPublicId, card.id, -amountMinor, nextBalance, idempotencyKey, input.orderId, userUuid, JSON.stringify({ giftCardId: input.giftCardId, merchandiseEligibleMinor, deliveryExcludedMinor: deliveryMinor, remainingPayableMinor }), new Date(now)]);

    if (remainingPayableMinor === 0) {
      await tx.query(`UPDATE payments SET provider='gift_card',provider_payment_id=$2,status='captured',authorised_minor=$3,captured_minor=$3,provider_payload=provider_payload||$4::jsonb,updated_at=$5 WHERE id=$1::uuid`, [order.payment_uuid, ledgerPublicId, amountMinor, JSON.stringify({ giftCardId: input.giftCardId, giftCardLedgerId: ledgerPublicId, giftCardAmountMinor: amountMinor, deliveryExcludedMinor: deliveryMinor, externalAmountMinor: 0 }), new Date(now)]);
      await tx.query(`UPDATE customer_orders SET status='confirmed',confirmed_at=COALESCE(confirmed_at,$2),updated_at=$2 WHERE id=$1::uuid`, [order.order_uuid, new Date(now)]);
      await tx.query(`UPDATE stock_reservations SET expires_at=GREATEST(expires_at,$2) WHERE order_line_id IN (SELECT id FROM order_lines WHERE order_id=$1::uuid) AND status='active'`, [order.order_uuid, new Date(now + PAID_RESERVATION_HOLD_MS)]);
    } else {
      await tx.query(`UPDATE payments SET provider_payload=provider_payload||$2::jsonb,updated_at=$3 WHERE id=$1::uuid`, [order.payment_uuid, JSON.stringify({ giftCardId: input.giftCardId, giftCardLedgerId: ledgerPublicId, giftCardAmountMinor: amountMinor, deliveryExcludedMinor: deliveryMinor, externalAmountMinor: remainingPayableMinor }), new Date(now)]);
    }

    return { card: rowView(updatedCard.rows[0]), orderId: input.orderId, amountMinor, merchandiseEligibleMinor, deliveryMinor, remainingPayableMinor, paymentComplete: remainingPayableMinor === 0 };
  }, { isolation: "serializable" });
}

export async function adminGiftCards(principal: SessionPrincipal): Promise<readonly GiftCardView[]> {
  if (!principal.roles.includes("super_admin")) throw new Error("ADMIN_PERMISSION_REQUIRED");
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT * FROM gift_cards ORDER BY created_at DESC LIMIT 250`);
    return result.rows.map(rowView);
  }, { readOnly: true });
}

export async function issueGiftCard(principal: SessionPrincipal, input: { valueMinor: number; recipientName?: string; recipientEmail?: string; message?: string; expiresAt?: number }): Promise<GiftCardIssueResult> {
  if (!principal.roles.includes("super_admin")) throw new Error("ADMIN_PERMISSION_REQUIRED");
  if (!productionDatabaseConfigured()) throw new Error("Gift cards require the production database");
  if (!Number.isSafeInteger(input.valueMinor) || input.valueMinor < 500 || input.valueMinor > 200_000) throw new Error("Gift-card value must be between €5 and €2,000");
  const code = makeCode(); const hash = codeHash(code); const suffix = normalizeCode(code).slice(-6); const publicId = `gift_${randomUUID()}`; const now = Date.now();
  const card = await uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const actor = await tx.query<SqlRow>(`SELECT id::text AS id FROM users WHERE public_id=$1 LIMIT 1`, [principal.userId]);
    if (!actor.rowCount) throw new Error("Admin actor was not found");
    const result = await tx.query<SqlRow>(`INSERT INTO gift_cards(public_id,market_id,code_hash,code_suffix,initial_value_minor,balance_minor,status,recipient_name,recipient_email,message,issued_by_user_id,issued_at,expires_at,created_at,updated_at)
      VALUES($1,(SELECT id FROM markets WHERE code='sparta'),$2,$3,$4,$4,'active',$5,$6,$7,$8::uuid,$9,$10,$9,$9) RETURNING *`, [publicId, hash, suffix, input.valueMinor, input.recipientName?.trim().slice(0,160) || null, input.recipientEmail?.trim().toLowerCase() || null, input.message?.trim().slice(0,500) || null, actor.rows[0].id, new Date(now), input.expiresAt ? new Date(input.expiresAt) : null]);
    await tx.query(`INSERT INTO gift_card_ledger(public_id,gift_card_id,entry_type,amount_minor,balance_after_minor,idempotency_key,actor_user_id,reason,metadata,created_at)
      VALUES($1,$2::uuid,'issue',$3,$3,$4,$5::uuid,'admin_issue',$6::jsonb,$7)`, [`gift_ledger_${randomUUID()}`, result.rows[0].id, input.valueMinor, `issue:${publicId}`, actor.rows[0].id, JSON.stringify({ livePurchaseEnabled: giftCardsLiveEnabled() }), new Date(now)]);
    await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,after_state,actor_public_id) VALUES('super_admin','gift_card.issued','gift_card',$1,'admin_issue',$2::jsonb,$3)`, [publicId, JSON.stringify({ valueMinor: input.valueMinor, suffix, recipientEmail: input.recipientEmail ? "provided" : "none", livePurchaseEnabled: giftCardsLiveEnabled() }), principal.userId]);
    return rowView(result.rows[0]);
  }, { isolation: "serializable" });
  return { card, code };
}
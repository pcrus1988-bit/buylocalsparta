import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorGiftCardAccess = Readonly<{
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  activeLocations: number;
}>;

export type VendorPhysicalGiftCardView = Readonly<{
  id: string;
  suffix: string;
  status: string;
  initialValueMinor: number;
  balanceMinor: number;
  currency: "EUR";
  recipientName?: string;
  issuedAt: number;
  expiresAt?: number;
  issuedByVendorId: string;
  issuedByVendorName: string;
}>;

export type VendorPhysicalGiftCardIssueResult = Readonly<{
  card: VendorPhysicalGiftCardView;
  code: string;
  vendor: VendorGiftCardAccess;
}>;

export type VendorPhysicalGiftCardLookup = Readonly<{
  id: string;
  suffix: string;
  status: string;
  balanceMinor: number;
  currency: "EUR";
  expiresAt?: number;
}>;

export type VendorPhysicalGiftCardRedemptionResult = Readonly<{
  card: VendorPhysicalGiftCardLookup;
  amountMinor: number;
  remainingBalanceMinor: number;
  ledgerId: string;
  vendor: VendorGiftCardAccess;
}>;

type VendorContextInternal = VendorGiftCardAccess & Readonly<{ vendorUuid: string; actorUuid: string }>;

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function pepper() {
  const value = process.env.GIFT_CARD_CODE_PEPPER?.trim();
  if (!value || value.length < 32) throw new Error("GIFT_CARD_CODE_PEPPER must be configured with at least 32 characters");
  return value;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function codeHash(code: string) {
  return createHmac("sha256", pepper()).update(normalizeCode(code)).digest("hex");
}

// Keep the physical-vendor issuance format identical to the governed Admin gift-card mechanism.
function makeCode() {
  const raw = randomBytes(15).toString("hex").toUpperCase();
  return `KM-${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 18)}-${raw.slice(18, 24)}`;
}

function asInt(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error("Invalid gift-card amount");
  return n;
}

function epoch(value: unknown) {
  if (!value) return undefined;
  const n = new Date(String(value)).getTime();
  return Number.isFinite(n) ? n : undefined;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function effectiveStatus(row: SqlRow, now = Date.now()) {
  if (row.expires_at && new Date(String(row.expires_at)).getTime() <= now && String(row.status) === "active") return "expired";
  return String(row.status);
}

function lookupView(row: SqlRow, now = Date.now()): VendorPhysicalGiftCardLookup {
  return {
    id: String(row.public_id),
    suffix: String(row.code_suffix),
    status: effectiveStatus(row, now),
    balanceMinor: asInt(row.balance_minor),
    currency: "EUR",
    expiresAt: epoch(row.expires_at)
  };
}

function vendorCardView(row: SqlRow): VendorPhysicalGiftCardView {
  return {
    id: String(row.public_id),
    suffix: String(row.code_suffix),
    status: String(row.status),
    initialValueMinor: asInt(row.initial_value_minor),
    balanceMinor: asInt(row.balance_minor),
    currency: "EUR",
    recipientName: typeof row.recipient_name === "string" ? row.recipient_name : undefined,
    issuedAt: epoch(row.issued_at) ?? 0,
    expiresAt: epoch(row.expires_at),
    issuedByVendorId: String(row.issued_by_vendor_public_id ?? ""),
    issuedByVendorName: String(row.issued_by_vendor_name ?? "")
  };
}

async function vendorContext(principal: SessionPrincipal, tx: SqlExecutor): Promise<VendorContextInternal> {
  if (!principal.vendorId) throw new Error("VENDOR_GIFT_CARD_ACCESS_REQUIRED");
  const result = await tx.query<SqlRow>(`
    SELECT vb.id::text AS vendor_uuid,
           vb.public_id AS vendor_public_id,
           vb.trading_name AS vendor_name,
           u.id::text AS actor_uuid,
           COALESCE(
             (SELECT vl.public_email::text
                FROM vendor_locations vl
               WHERE vl.vendor_id=vb.id AND vl.active=true AND vl.public_email IS NOT NULL
               ORDER BY vl.verified_at DESC NULLS LAST, vl.created_at ASC
               LIMIT 1),
             (SELECT u2.email::text
                FROM vendor_users vu
                JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id AND vur.role='vendor_owner'
                JOIN users u2 ON u2.id=vu.user_id
               WHERE vu.vendor_id=vb.id AND vu.active=true AND u2.status='active'
               ORDER BY vu.created_at ASC
               LIMIT 1),
             u.email::text
           ) AS vendor_email,
           (SELECT COUNT(*)::int FROM vendor_locations vl2 WHERE vl2.vendor_id=vb.id AND vl2.active=true) AS active_locations
      FROM vendor_businesses vb
      JOIN users u ON u.public_id=$2 AND u.status='active'
     WHERE vb.public_id=$1
       AND vb.status='active'
       AND EXISTS (SELECT 1 FROM vendor_locations vl3 WHERE vl3.vendor_id=vb.id AND vl3.active=true)
     LIMIT 1`, [principal.vendorId, principal.userId]);
  if (!result.rowCount) throw new Error("Οι δωροκάρτες σε φυσικό σημείο είναι διαθέσιμες μόνο σε ενεργό συνεργάτη με ενεργό κατάστημα.");
  const row = result.rows[0];
  const vendorEmail = String(row.vendor_email ?? "").trim().toLowerCase();
  if (!validEmail(vendorEmail)) throw new Error("Δεν υπάρχει έγκυρο email για το ενεργό κατάστημα.");
  return {
    vendorId: String(row.vendor_public_id),
    vendorName: String(row.vendor_name),
    vendorEmail,
    activeLocations: asInt(row.active_locations),
    vendorUuid: String(row.vendor_uuid),
    actorUuid: String(row.actor_uuid)
  };
}

export async function vendorGiftCardAccess(principal: SessionPrincipal): Promise<VendorGiftCardAccess> {
  if (!productionDatabaseConfigured()) throw new Error("Gift cards require the production database");
  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const context = await vendorContext(principal, tx);
    return { vendorId: context.vendorId, vendorName: context.vendorName, vendorEmail: context.vendorEmail, activeLocations: context.activeLocations };
  }, { readOnly: true });
}

export async function issueVendorPhysicalGiftCard(principal: SessionPrincipal, input: {
  valueMinor: number;
  customerName: string;
  customerEmail: string;
  now?: number;
}): Promise<VendorPhysicalGiftCardIssueResult> {
  if (!productionDatabaseConfigured()) throw new Error("Gift cards require the production database");
  if (!Number.isSafeInteger(input.valueMinor) || input.valueMinor < 500 || input.valueMinor > 200_000) throw new Error("Η αξία της Gift Card πρέπει να είναι από 5 € έως 2.000 €.");
  const customerName = input.customerName.trim().slice(0, 160);
  const customerEmail = input.customerEmail.trim().toLowerCase();
  if (!customerName) throw new Error("Συμπλήρωσε το όνομα του πελάτη.");
  if (!validEmail(customerEmail)) throw new Error("Συμπλήρωσε έγκυρο email πελάτη.");

  const code = makeCode();
  const hash = codeHash(code);
  const suffix = normalizeCode(code).slice(-6);
  const publicId = `gift_${randomUUID()}`;
  const now = input.now ?? Date.now();

  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const context = await vendorContext(principal, tx);
    const inserted = await tx.query<SqlRow>(`
      INSERT INTO gift_cards(
        public_id,market_id,code_hash,code_suffix,initial_value_minor,balance_minor,status,
        recipient_name,recipient_email,issued_by_user_id,issued_by_vendor_id,issue_channel,
        issued_at,created_at,updated_at
      ) VALUES(
        $1,(SELECT id FROM markets WHERE code='sparta'),$2,$3,$4,$4,'active',
        $5,$6,$7::uuid,$8::uuid,'vendor_physical',$9,$9,$9
      )
      RETURNING *`, [publicId, hash, suffix, input.valueMinor, customerName, customerEmail, context.actorUuid, context.vendorUuid, new Date(now)]);

    const ledgerId = `gift_ledger_${randomUUID()}`;
    await tx.query(`
      INSERT INTO gift_card_ledger(
        public_id,gift_card_id,entry_type,amount_minor,balance_after_minor,idempotency_key,
        actor_user_id,reason,metadata,created_at
      ) VALUES($1,$2::uuid,'issue',$3,$3,$4,$5::uuid,'vendor_physical_cash_issue',$6::jsonb,$7)`, [
      ledgerId,
      inserted.rows[0].id,
      input.valueMinor,
      `vendor-issue:${publicId}`,
      context.actorUuid,
      JSON.stringify({ issueChannel: "vendor_physical", vendorId: context.vendorId, vendorName: context.vendorName, cashPaymentConfirmed: true }),
      new Date(now)
    ]);

    const actorRole = principal.roles.includes("vendor_owner") ? "vendor_owner" : "vendor_fulfilment";
    await tx.query(`
      INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,after_state,actor_public_id)
      VALUES($1,'gift_card.vendor_issued','gift_card',$2,'vendor_physical_cash_issue',$3::jsonb,$4)`, [
      actorRole,
      publicId,
      JSON.stringify({ valueMinor: input.valueMinor, suffix, vendorId: context.vendorId, vendorName: context.vendorName, customerEmail: "provided", cashPaymentConfirmed: true }),
      principal.userId
    ]);

    const row = { ...inserted.rows[0], issued_by_vendor_public_id: context.vendorId, issued_by_vendor_name: context.vendorName };
    return {
      card: vendorCardView(row),
      code,
      vendor: { vendorId: context.vendorId, vendorName: context.vendorName, vendorEmail: context.vendorEmail, activeLocations: context.activeLocations }
    };
  }, { isolation: "serializable" });
}

export async function lookupVendorPhysicalGiftCard(principal: SessionPrincipal, rawCode: string): Promise<VendorPhysicalGiftCardLookup> {
  if (!productionDatabaseConfigured()) throw new Error("Gift cards require the production database");
  const normalized = normalizeCode(rawCode);
  if (normalized.length < 20 || normalized.length > 40) throw new Error("Ο κωδικός Gift Card δεν είναι έγκυρος.");
  const hash = codeHash(normalized);
  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    await vendorContext(principal, tx);
    const result = await tx.query<SqlRow>(`
      SELECT gc.*
        FROM gift_cards gc
       WHERE gc.code_hash=$1
         AND gc.market_id=(SELECT id FROM markets WHERE code='sparta')
       LIMIT 1`, [hash]);
    if (!result.rowCount) throw new Error("Η Gift Card δεν βρέθηκε.");
    return lookupView(result.rows[0]);
  }, { readOnly: true });
}

export async function redeemVendorPhysicalGiftCard(principal: SessionPrincipal, input: {
  code: string;
  amountMinor: number;
  idempotencyKey: string;
  now?: number;
}): Promise<VendorPhysicalGiftCardRedemptionResult> {
  if (!productionDatabaseConfigured()) throw new Error("Gift cards require the production database");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Συμπλήρωσε έγκυρο ποσό εξαργύρωσης.");
  const clientKey = input.idempotencyKey.trim();
  if (!clientKey || clientKey.length > 160) throw new Error("Missing redemption idempotency key");
  const normalized = normalizeCode(input.code);
  if (normalized.length < 20 || normalized.length > 40) throw new Error("Ο κωδικός Gift Card δεν είναι έγκυρος.");
  const hash = codeHash(normalized);
  const now = input.now ?? Date.now();

  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const context = await vendorContext(principal, tx);
    const idempotencyKey = `vendor-redeem:${context.vendorId}:${clientKey}`;
    const cardResult = await tx.query<SqlRow>(`
      SELECT gc.*
        FROM gift_cards gc
       WHERE gc.code_hash=$1
         AND gc.market_id=(SELECT id FROM markets WHERE code='sparta')
       FOR UPDATE`, [hash]);
    if (!cardResult.rowCount) throw new Error("Η Gift Card δεν βρέθηκε.");
    const card = cardResult.rows[0];

    const prior = await tx.query<SqlRow>(`
      SELECT public_id,amount_minor,balance_after_minor
        FROM gift_card_ledger
       WHERE idempotency_key=$1 AND gift_card_id=$2::uuid AND entry_type='redeem'
       LIMIT 1`, [idempotencyKey, card.id]);
    if (prior.rowCount) {
      const current = lookupView(card, now);
      return {
        card: current,
        amountMinor: Math.abs(asInt(prior.rows[0].amount_minor)),
        remainingBalanceMinor: asInt(prior.rows[0].balance_after_minor),
        ledgerId: String(prior.rows[0].public_id),
        vendor: { vendorId: context.vendorId, vendorName: context.vendorName, vendorEmail: context.vendorEmail, activeLocations: context.activeLocations }
      };
    }

    if (String(card.status) !== "active") throw new Error(String(card.status) === "depleted" ? "Η Gift Card δεν έχει διαθέσιμο υπόλοιπο." : "Η Gift Card δεν είναι ενεργή.");
    if (card.expires_at && new Date(String(card.expires_at)).getTime() <= now) throw new Error("Η Gift Card έχει λήξει.");
    const balanceMinor = asInt(card.balance_minor);
    if (input.amountMinor > balanceMinor) throw new Error(`Το ποσό υπερβαίνει το διαθέσιμο υπόλοιπο ${(balanceMinor / 100).toFixed(2)} €.`);

    const nextBalance = balanceMinor - input.amountMinor;
    const updated = await tx.query<SqlRow>(`
      UPDATE gift_cards
         SET balance_minor=$2,
             status=CASE WHEN $2=0 THEN 'depleted' ELSE 'active' END,
             updated_at=$3
       WHERE id=$1::uuid
       RETURNING *`, [card.id, nextBalance, new Date(now)]);

    const ledgerId = `gift_ledger_${randomUUID()}`;
    await tx.query(`
      INSERT INTO gift_card_ledger(
        public_id,gift_card_id,entry_type,amount_minor,balance_after_minor,currency,
        idempotency_key,actor_user_id,reason,metadata,created_at
      ) VALUES($1,$2::uuid,'redeem',$3,$4,'EUR',$5,$6::uuid,'vendor_physical_cash_redemption',$7::jsonb,$8)`, [
      ledgerId,
      card.id,
      -input.amountMinor,
      nextBalance,
      idempotencyKey,
      context.actorUuid,
      JSON.stringify({ channel: "vendor_physical", vendorId: context.vendorId, vendorName: context.vendorName, cashPaymentConfirmed: true, requestedAmountMinor: input.amountMinor }),
      new Date(now)
    ]);

    const actorRole = principal.roles.includes("vendor_owner") ? "vendor_owner" : "vendor_fulfilment";
    await tx.query(`
      INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,after_state,actor_public_id)
      VALUES($1,'gift_card.vendor_redeemed','gift_card',$2,'vendor_physical_cash_redemption',$3::jsonb,$4)`, [
      actorRole,
      String(card.public_id),
      JSON.stringify({ amountMinor: input.amountMinor, balanceBeforeMinor: balanceMinor, balanceAfterMinor: nextBalance, suffix: card.code_suffix, vendorId: context.vendorId, vendorName: context.vendorName, ledgerId, cashPaymentConfirmed: true }),
      principal.userId
    ]);

    return {
      card: lookupView(updated.rows[0], now),
      amountMinor: input.amountMinor,
      remainingBalanceMinor: nextBalance,
      ledgerId,
      vendor: { vendorId: context.vendorId, vendorName: context.vendorName, vendorEmail: context.vendorEmail, activeLocations: context.activeLocations }
    };
  }, { isolation: "serializable" });
}

export async function adminVendorPhysicalGiftCards(principal: SessionPrincipal): Promise<readonly VendorPhysicalGiftCardView[]> {
  if (!principal.roles.includes("super_admin")) throw new Error("ADMIN_PERMISSION_REQUIRED");
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT gc.*,vb.public_id AS issued_by_vendor_public_id,vb.trading_name AS issued_by_vendor_name
        FROM gift_cards gc
        JOIN vendor_businesses vb ON vb.id=gc.issued_by_vendor_id
       WHERE gc.issue_channel='vendor_physical'
       ORDER BY gc.issued_at DESC
       LIMIT 500`);
    return result.rows.map(vendorCardView);
  }, { readOnly: true });
}

import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CommissionTaxMode = "included" | "plus_vat" | "none";
export type CommercialAgreementStatus = "draft" | "active" | "suspended" | "expired" | "terminated";

export type CommercialAgreementWorkspace = Readonly<{
  vendors: readonly Readonly<{ id: string; name: string; status: string }>[];
  agreements: readonly Readonly<{
    id: string;
    vendorId: string;
    vendorName: string;
    agreementCode: string;
    agreementVersion: number;
    status: CommercialAgreementStatus;
    startsAt: string;
    endsAt?: string;
    signedAt?: string;
    commissionRateBps: number;
    commissionTaxMode: CommissionTaxMode;
    commissionTaxRateBps: number;
    sourceDocumentReference?: string;
    listingFeeMinor?: number;
    recurringFeeMinor?: number;
    recurringFeePeriod?: "month" | "year" | "term";
    subscriptionId?: string;
    createdAt: string;
    updatedAt: string;
  }>[];
}>;

function integer(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${field} is invalid`);
  return parsed;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value == null || value === "") return undefined;
  return integer(value, field);
}

function timestamp(value: unknown, field: string): Date {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} is invalid`);
  return date;
}

function optionalTimestamp(value: unknown, field: string): Date | undefined {
  if (value == null || value === "") return undefined;
  return timestamp(value, field);
}

function text(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${field} is too long`);
  return result;
}

function optionalText(value: unknown, field: string, max = 500): string | undefined {
  if (value == null || value === "") return undefined;
  return text(value, field, max);
}

export async function commercialAgreementWorkspace(): Promise<CommercialAgreementWorkspace> {
  const db = getProductionPostgresRuntime().nativePool;
  const [vendorRows, agreementRows] = await Promise.all([
    db.query(`
      SELECT v.public_id, COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS name, v.status::text AS status
      FROM vendor_businesses v
      WHERE v.market_id=(SELECT id FROM markets WHERE code='sparta')
      ORDER BY lower(COALESCE(NULLIF(v.trading_name,''),v.legal_name)),v.public_id
    `),
    db.query(`
      SELECT a.public_id,v.public_id AS vendor_public_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
             a.agreement_code,a.agreement_version,a.status,a.starts_at,a.ends_at,a.signed_at,
             a.commission_rate_bps,a.commission_tax_mode,a.commission_tax_rate_bps,a.source_document_reference,
             a.listing_fee_minor,a.recurring_fee_minor,a.recurring_fee_period,vs.public_id AS subscription_public_id,
             a.created_at,a.updated_at
      FROM vendor_commercial_agreements a
      JOIN vendor_businesses v ON v.id=a.vendor_id
      LEFT JOIN vendor_subscriptions vs ON vs.id=a.subscription_id
      WHERE a.market_id=(SELECT id FROM markets WHERE code='sparta')
      ORDER BY a.starts_at DESC,a.created_at DESC,a.public_id
    `)
  ]);
  return {
    vendors: vendorRows.rows.map((row) => ({ id: String(row.public_id), name: String(row.name), status: String(row.status) })),
    agreements: agreementRows.rows.map((row) => ({
      id: String(row.public_id),
      vendorId: String(row.vendor_public_id),
      vendorName: String(row.vendor_name),
      agreementCode: String(row.agreement_code),
      agreementVersion: Number(row.agreement_version),
      status: String(row.status) as CommercialAgreementStatus,
      startsAt: new Date(row.starts_at).toISOString(),
      endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : undefined,
      signedAt: row.signed_at ? new Date(row.signed_at).toISOString() : undefined,
      commissionRateBps: Number(row.commission_rate_bps),
      commissionTaxMode: String(row.commission_tax_mode) as CommissionTaxMode,
      commissionTaxRateBps: Number(row.commission_tax_rate_bps),
      sourceDocumentReference: row.source_document_reference ? String(row.source_document_reference) : undefined,
      listingFeeMinor: row.listing_fee_minor == null ? undefined : Number(row.listing_fee_minor),
      recurringFeeMinor: row.recurring_fee_minor == null ? undefined : Number(row.recurring_fee_minor),
      recurringFeePeriod: row.recurring_fee_period ? String(row.recurring_fee_period) as "month" | "year" | "term" : undefined,
      subscriptionId: row.subscription_public_id ? String(row.subscription_public_id) : undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    }))
  };
}

export async function createCommercialAgreement(principal: SessionPrincipal, raw: Record<string, unknown>) {
  const vendorId = text(raw.vendorId, "vendorId");
  const agreementCode = text(raw.agreementCode, "agreementCode", 120);
  const agreementVersion = integer(raw.agreementVersion ?? 1, "agreementVersion", 1, 10_000);
  const startsAt = timestamp(raw.startsAt, "startsAt");
  const endsAt = optionalTimestamp(raw.endsAt, "endsAt");
  if (endsAt && endsAt <= startsAt) throw new Error("endsAt must be after startsAt");
  const commissionRateBps = integer(raw.commissionRateBps, "commissionRateBps", 0, 10_000);
  const commissionTaxMode = text(raw.commissionTaxMode ?? "included", "commissionTaxMode", 20) as CommissionTaxMode;
  if (!["included","plus_vat","none"].includes(commissionTaxMode)) throw new Error("commissionTaxMode is invalid");
  const commissionTaxRateBps = integer(raw.commissionTaxRateBps ?? 2400, "commissionTaxRateBps", 0, 10_000);
  const listingFeeMinor = optionalInteger(raw.listingFeeMinor, "listingFeeMinor");
  const recurringFeeMinor = optionalInteger(raw.recurringFeeMinor, "recurringFeeMinor");
  const recurringFeePeriod = optionalText(raw.recurringFeePeriod, "recurringFeePeriod", 20) as "month" | "year" | "term" | undefined;
  if (recurringFeePeriod && !["month","year","term"].includes(recurringFeePeriod)) throw new Error("recurringFeePeriod is invalid");
  const sourceDocumentReference = optionalText(raw.sourceDocumentReference, "sourceDocumentReference", 500);
  const signedAt = optionalTimestamp(raw.signedAt, "signedAt");
  const requestedStatus = (optionalText(raw.status, "status", 20) ?? "draft") as CommercialAgreementStatus;
  if (!["draft","active"].includes(requestedStatus)) throw new Error("New agreements can only be draft or active");
  if (requestedStatus === "active" && (!signedAt || !sourceDocumentReference)) throw new Error("Active agreements require signedAt and sourceDocumentReference");
  const termsSnapshot = raw.termsSnapshot && typeof raw.termsSnapshot === "object" && !Array.isArray(raw.termsSnapshot) ? raw.termsSnapshot : {};

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const vendor = await client.query(`SELECT id,market_id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [vendorId]);
    if (!vendor.rowCount) throw new Error("Vendor not found");
    const actor = await client.query(`SELECT id FROM users WHERE public_id=$1 OR id::text=$1`, [principal.userId]);
    const subscriptionId = optionalText(raw.subscriptionId, "subscriptionId", 160);
    let subscriptionUuid: string | null = null;
    if (subscriptionId) {
      const subscription = await client.query(`SELECT id FROM vendor_subscriptions WHERE (public_id=$1 OR id::text=$1) AND vendor_id=$2`, [subscriptionId, vendor.rows[0].id]);
      if (!subscription.rowCount) throw new Error("Vendor subscription not found");
      subscriptionUuid = String(subscription.rows[0].id);
    }
    const publicId = `agreement_${randomUUID().replaceAll("-","").slice(0,20)}`;
    await client.query(`
      INSERT INTO vendor_commercial_agreements(
        id,public_id,market_id,vendor_id,subscription_id,agreement_code,agreement_version,status,
        starts_at,ends_at,signed_at,commission_rate_bps,commission_basis,commission_tax_mode,
        commission_tax_rate_bps,commission_applies_to_shipping,listing_fee_minor,recurring_fee_minor,
        recurring_fee_period,source_document_reference,terms_snapshot,created_by,created_at,updated_at
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'merchandise_gross',$13,$14,false,$15,$16,$17,$18,$19,$20,now(),now()
      )
    `, [
      randomUUID(), publicId, vendor.rows[0].market_id, vendor.rows[0].id, subscriptionUuid,
      agreementCode, agreementVersion, requestedStatus, startsAt, endsAt ?? null, signedAt ?? null,
      commissionRateBps, commissionTaxMode, commissionTaxRateBps, listingFeeMinor ?? null,
      recurringFeeMinor ?? null, recurringFeePeriod ?? null, sourceDocumentReference ?? null,
      JSON.stringify({ ...termsSnapshot, commissionAuthority: "individual_vendor_agreement", customerPricePolicy: "vendor_final_price_no_markup" }),
      actor.rowCount ? actor.rows[0].id : null
    ]);
    await client.query("COMMIT");
    return publicId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function changeCommercialAgreementStatus(principal: SessionPrincipal, raw: Record<string, unknown>) {
  const agreementId = text(raw.agreementId, "agreementId");
  const status = text(raw.status, "status", 20) as CommercialAgreementStatus;
  if (!["active","suspended","expired","terminated"].includes(status)) throw new Error("Unsupported agreement status");
  const sourceDocumentReference = optionalText(raw.sourceDocumentReference, "sourceDocumentReference", 500);
  const signedAt = optionalTimestamp(raw.signedAt, "signedAt");
  const endsAt = optionalTimestamp(raw.endsAt, "endsAt");
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,status,signed_at,source_document_reference FROM vendor_commercial_agreements WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [agreementId]);
    if (!current.rowCount) throw new Error("Agreement not found");
    if (status === "active" && !(signedAt ?? current.rows[0].signed_at) ) throw new Error("Activating an agreement requires signedAt");
    if (status === "active" && !(sourceDocumentReference ?? current.rows[0].source_document_reference)) throw new Error("Activating an agreement requires sourceDocumentReference");
    await client.query(`
      UPDATE vendor_commercial_agreements
      SET status=$2,
          signed_at=COALESCE($3,signed_at),
          source_document_reference=COALESCE($4,source_document_reference),
          ends_at=CASE WHEN $2='terminated' THEN COALESCE($5,now()) ELSE COALESCE($5,ends_at) END,
          terms_snapshot=terms_snapshot || jsonb_build_object('lastStatusChangeBy',$6,'lastStatusChangeAt',now()),
          updated_at=now()
      WHERE id=$1
    `, [current.rows[0].id, status, signedAt ?? null, sourceDocumentReference ?? null, endsAt ?? null, principal.userId]);
    await client.query("COMMIT");
    return agreementId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

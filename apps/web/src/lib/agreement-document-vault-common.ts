import { createHash } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import type { VendorAgreementPdfData } from "./vendor-agreement-pdf";

export function agreementText(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${field} is too long`);
  return result;
}

export function agreementOptionalTimestamp(value: unknown, field: string): Date | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is invalid`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} is invalid`);
  return date;
}

export function agreementRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function iso(value: unknown): string | undefined {
  return value ? new Date(value as string | number | Date).toISOString() : undefined;
}

export function agreementPdfHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function agreementPdfObjectKey(vendorPublicId: string, agreementCode: string, version: number, kind: "unsigned" | "signed-govgr"): string {
  const safeCode = agreementCode.replace(/[^A-Za-z0-9._-]/g, "-");
  return `vendor-agreements/${vendorPublicId}/${safeCode}/v${version}/${kind}.pdf`;
}

export async function agreementActorUserId(client: any, principal: SessionPrincipal): Promise<string | null> {
  const actor = await client.query(`SELECT id FROM users WHERE public_id=$1 OR id::text=$1`, [principal.userId]);
  return actor.rowCount ? String(actor.rows[0].id) : null;
}

export async function agreementAudit(client: any, input: {
  agreementId: string;
  vendorId: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await client.query(`
    INSERT INTO vendor_agreement_audit_log(agreement_id,vendor_id,action,from_status,to_status,actor_user_id,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
  `, [input.agreementId,input.vendorId,input.action,input.fromStatus ?? null,input.toStatus ?? null,input.actorUserId ?? null,JSON.stringify(input.metadata ?? {})]);
}

export async function agreementPdfData(agreementId: string): Promise<{ row: any; data: VendorAgreementPdfData }> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`
    SELECT a.*,v.public_id AS vendor_public_id
    FROM vendor_commercial_agreements a
    JOIN vendor_businesses v ON v.id=a.vendor_id
    WHERE a.public_id=$1 OR a.id::text=$1
  `, [agreementId]);
  if (!result.rowCount) throw new Error("Agreement not found");
  const row = result.rows[0];
  const vendor = agreementRecord(row.vendor_snapshot) as VendorAgreementPdfData["vendor"];
  const commercial = agreementRecord(row.commercial_terms_snapshot) as VendorAgreementPdfData["commercial"];
  return { row, data: {
    agreementCode: String(row.agreement_code),
    agreementVersion: Number(row.agreement_version),
    createdAt: new Date(row.created_at).toISOString(),
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: iso(row.ends_at),
    vendor,
    commercial: {
      ...commercial,
      commissionRateBps: Number(row.commission_rate_bps),
      commissionTaxMode: String(row.commission_tax_mode),
      commissionTaxRateBps: Number(row.commission_tax_rate_bps),
      listingFeeMinor: row.listing_fee_minor == null ? undefined : Number(row.listing_fee_minor),
      recurringFeeMinor: row.recurring_fee_minor == null ? undefined : Number(row.recurring_fee_minor),
      recurringFeePeriod: row.recurring_fee_period ? String(row.recurring_fee_period) : undefined
    },
    govgrReference: row.govgr_reference ? String(row.govgr_reference) : undefined
  }};
}

export async function upsertAgreementVaultPdf(client: any, input: {
  agreementId: string;
  vendorId: string;
  objectKey: string;
  kind: "unsigned" | "signed-govgr";
  buffer: Buffer;
  sha256: string;
  actorUserId?: string | null;
}): Promise<void> {
  await client.query(`
    INSERT INTO vendor_agreement_documents(agreement_id,vendor_id,object_key,document_kind,content_type,content,byte_size,sha256,created_by,created_at,updated_at)
    VALUES($1,$2,$3,$4,'application/pdf',$5,$6,$7,$8,now(),now())
    ON CONFLICT (agreement_id,document_kind) DO UPDATE
    SET object_key=EXCLUDED.object_key,content=EXCLUDED.content,byte_size=EXCLUDED.byte_size,sha256=EXCLUDED.sha256,updated_at=now()
  `, [input.agreementId,input.vendorId,input.objectKey,input.kind,input.buffer,input.buffer.byteLength,input.sha256,input.actorUserId ?? null]);
}

export async function readAgreementVaultPdf(objectKey: string): Promise<Buffer> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`SELECT content,byte_size,sha256 FROM vendor_agreement_documents WHERE object_key=$1`, [objectKey]);
  if (!result.rowCount) throw new Error("Agreement PDF evidence is missing from the private document vault");
  const buffer = Buffer.from(result.rows[0].content);
  if (buffer.byteLength !== Number(result.rows[0].byte_size)) throw new Error("Agreement PDF vault size verification failed");
  if (agreementPdfHash(buffer) !== String(result.rows[0].sha256)) throw new Error("Agreement PDF vault hash verification failed");
  return buffer;
}

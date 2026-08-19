import { createHash, randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";
import { resendConfigFromEnv } from "@buy-local-sparta/resend-notifications";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { KONTA_MOY_LEGAL_DETAILS, renderVendorAgreementPdf, type VendorAgreementPdfData } from "./vendor-agreement-pdf";

export type CommissionTaxMode = "included" | "plus_vat" | "none";
export type CommercialAgreementStatus =
  | "draft"
  | "data_complete"
  | "pdf_generated"
  | "sent"
  | "pending_signature"
  | "signed_received"
  | "govgr_verified"
  | "eligible_for_activation"
  | "active"
  | "suspended"
  | "expired"
  | "terminated"
  | "superseded"
  | "rejected";

export type AdminAgreementVendor = Readonly<{
  id: string;
  name: string;
  status: string;
  legalName: string;
  tradingName: string;
  legalForm?: string;
  taxNumber?: string;
  gemiNumber?: string;
  contactEmail?: string;
  phone?: string;
  registeredAddress?: string;
  shopAddress?: string;
  primaryCategory?: string;
}>;

export type CommercialAgreementWorkspace = Readonly<{
  nextAgreementCode: string;
  vendors: readonly AdminAgreementVendor[];
  agreements: readonly Readonly<{
    id: string;
    vendorId: string;
    vendorName: string;
    vendorEmail?: string;
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
    govgrReference?: string;
    govgrVerifiedAt?: string;
    signedDocumentReceivedAt?: string;
    listingFeeMinor?: number;
    recurringFeeMinor?: number;
    recurringFeePeriod?: "month" | "year" | "term";
    subscriptionId?: string;
    unsignedPdfAvailable: boolean;
    signedPdfAvailable: boolean;
    pdfGeneratedAt?: string;
    pdfSentAt?: string;
    activatedAt?: string;
    vendorSnapshot: Readonly<Record<string, unknown>>;
    commercialTermsSnapshot: Readonly<Record<string, unknown>>;
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

function optionalText(value: unknown, field: string, max = 1000): string | undefined {
  if (value == null || value === "") return undefined;
  return text(value, field, max);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function iso(value: unknown): string | undefined {
  return value ? new Date(value as string | number | Date).toISOString() : undefined;
}

function actorUserIdQuery(principal: SessionPrincipal): readonly [string, readonly unknown[]] {
  return [`SELECT id FROM users WHERE public_id=$1 OR id::text=$1`, [principal.userId]] as const;
}

async function resolveActorUserId(client: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rowCount: number | null; rows: any[] }> }, principal: SessionPrincipal): Promise<string | null> {
  const [sql, params] = actorUserIdQuery(principal);
  const actor = await client.query(sql, params);
  return actor.rowCount ? String(actor.rows[0].id) : null;
}

function storage(): S3ObjectStorage {
  return new S3ObjectStorage(objectStorageConfigFromEnv());
}

async function storePrivatePdf(objectKey: string, buffer: Buffer): Promise<void> {
  const target = storage();
  const upload = await target.createUploadUrl({ objectKey, contentType: "application/pdf", expiresInSeconds: 600 });
  const response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: new Uint8Array(buffer) });
  if (!response.ok) throw new Error(`Agreement PDF storage failed (${response.status})`);
  const stored = await target.head(objectKey);
  if (!stored || stored.byteSize !== buffer.byteLength) throw new Error("Agreement PDF storage verification failed");
}

async function readPrivatePdf(objectKey: string): Promise<Buffer> {
  const source = await storage().read(objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of source.stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function pdfHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function pdfObjectKey(vendorPublicId: string, agreementCode: string, version: number, kind: "unsigned" | "signed-govgr"): string {
  const safeCode = agreementCode.replace(/[^A-Za-z0-9._-]/g, "-");
  return `vendor-agreements/${vendorPublicId}/${safeCode}/v${version}/${kind}.pdf`;
}

async function audit(client: any, input: { agreementId: string; vendorId: string; action: string; fromStatus?: string; toStatus?: string; actorUserId?: string | null; metadata?: Record<string, unknown> }): Promise<void> {
  await client.query(`
    INSERT INTO vendor_agreement_audit_log(agreement_id,vendor_id,action,from_status,to_status,actor_user_id,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
  `, [input.agreementId, input.vendorId, input.action, input.fromStatus ?? null, input.toStatus ?? null, input.actorUserId ?? null, JSON.stringify(input.metadata ?? {})]);
}

export async function commercialAgreementWorkspace(): Promise<CommercialAgreementWorkspace> {
  const db = getProductionPostgresRuntime().nativePool;
  const [vendorRows, agreementRows, nextCode] = await Promise.all([
    db.query(`
      SELECT v.public_id,
             COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS name,
             v.status::text AS status,
             v.legal_name,v.trading_name,v.legal_form,v.tax_number,v.gemi_number,
             COALESCE(va.contact_email::text,vl.public_email::text) AS contact_email,
             COALESCE(va.phone,vl.phone) AS phone,
             COALESCE(va.address_line1,vl.address_line1) AS registered_address,
             concat_ws(', ',NULLIF(vl.address_line1,''),NULLIF(vl.locality,''),NULLIF(vl.postcode,'')) AS shop_address,
             va.primary_category
      FROM vendor_businesses v
      LEFT JOIN LATERAL (
        SELECT contact_email,phone,address_line1,postcode,primary_category
        FROM vendor_applications x
        WHERE x.vendor_id=v.id
        ORDER BY x.updated_at DESC,x.created_at DESC
        LIMIT 1
      ) va ON true
      LEFT JOIN LATERAL (
        SELECT address_line1,locality,postcode,phone,public_email
        FROM vendor_locations x
        WHERE x.vendor_id=v.id
        ORDER BY x.is_primary DESC,x.created_at ASC
        LIMIT 1
      ) vl ON true
      WHERE v.market_id=(SELECT id FROM markets WHERE code='sparta')
      ORDER BY lower(COALESCE(NULLIF(v.trading_name,''),v.legal_name)),v.public_id
    `),
    db.query(`
      SELECT a.public_id,v.public_id AS vendor_public_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
             a.agreement_code,a.agreement_version,a.status,a.starts_at,a.ends_at,a.signed_at,
             a.commission_rate_bps,a.commission_tax_mode,a.commission_tax_rate_bps,a.source_document_reference,
             a.govgr_reference,a.govgr_verified_at,a.signed_document_received_at,
             a.listing_fee_minor,a.recurring_fee_minor,a.recurring_fee_period,vs.public_id AS subscription_public_id,
             a.unsigned_pdf_object_key,a.signed_pdf_object_key,a.pdf_generated_at,a.pdf_sent_at,a.activated_at,
             a.vendor_snapshot,a.commercial_terms_snapshot,a.created_at,a.updated_at
      FROM vendor_commercial_agreements a
      JOIN vendor_businesses v ON v.id=a.vendor_id
      LEFT JOIN vendor_subscriptions vs ON vs.id=a.subscription_id
      WHERE a.market_id=(SELECT id FROM markets WHERE code='sparta')
      ORDER BY a.created_at DESC,a.public_id
    `),
    db.query(`SELECT bls_private.peek_vendor_agreement_code() AS code`)
  ]);

  return {
    nextAgreementCode: String(nextCode.rows[0]?.code ?? "KM-AGR-AUTO"),
    vendors: vendorRows.rows.map((row) => ({
      id: String(row.public_id),
      name: String(row.name),
      status: String(row.status),
      legalName: String(row.legal_name),
      tradingName: String(row.trading_name),
      legalForm: row.legal_form ? String(row.legal_form) : undefined,
      taxNumber: row.tax_number ? String(row.tax_number) : undefined,
      gemiNumber: row.gemi_number ? String(row.gemi_number) : undefined,
      contactEmail: row.contact_email ? String(row.contact_email) : undefined,
      phone: row.phone ? String(row.phone) : undefined,
      registeredAddress: row.registered_address ? String(row.registered_address) : undefined,
      shopAddress: row.shop_address ? String(row.shop_address) : undefined,
      primaryCategory: row.primary_category ? String(row.primary_category) : undefined
    })),
    agreements: agreementRows.rows.map((row) => {
      const vendorSnapshot = record(row.vendor_snapshot);
      return {
        id: String(row.public_id),
        vendorId: String(row.vendor_public_id),
        vendorName: String(row.vendor_name),
        vendorEmail: typeof vendorSnapshot.contactEmail === "string" ? vendorSnapshot.contactEmail : undefined,
        agreementCode: String(row.agreement_code),
        agreementVersion: Number(row.agreement_version),
        status: String(row.status) as CommercialAgreementStatus,
        startsAt: new Date(row.starts_at).toISOString(),
        endsAt: iso(row.ends_at),
        signedAt: iso(row.signed_at),
        commissionRateBps: Number(row.commission_rate_bps),
        commissionTaxMode: String(row.commission_tax_mode) as CommissionTaxMode,
        commissionTaxRateBps: Number(row.commission_tax_rate_bps),
        sourceDocumentReference: row.source_document_reference ? String(row.source_document_reference) : undefined,
        govgrReference: row.govgr_reference ? String(row.govgr_reference) : undefined,
        govgrVerifiedAt: iso(row.govgr_verified_at),
        signedDocumentReceivedAt: iso(row.signed_document_received_at),
        listingFeeMinor: row.listing_fee_minor == null ? undefined : Number(row.listing_fee_minor),
        recurringFeeMinor: row.recurring_fee_minor == null ? undefined : Number(row.recurring_fee_minor),
        recurringFeePeriod: row.recurring_fee_period ? String(row.recurring_fee_period) as "month" | "year" | "term" : undefined,
        subscriptionId: row.subscription_public_id ? String(row.subscription_public_id) : undefined,
        unsignedPdfAvailable: Boolean(row.unsigned_pdf_object_key),
        signedPdfAvailable: Boolean(row.signed_pdf_object_key),
        pdfGeneratedAt: iso(row.pdf_generated_at),
        pdfSentAt: iso(row.pdf_sent_at),
        activatedAt: iso(row.activated_at),
        vendorSnapshot,
        commercialTermsSnapshot: record(row.commercial_terms_snapshot),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      };
    })
  };
}

export async function createCommercialAgreement(principal: SessionPrincipal, raw: Record<string, unknown>): Promise<{ agreementId: string; agreementCode: string }> {
  const vendorId = text(raw.vendorId, "vendorId");
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

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const vendor = await client.query(`
      SELECT v.id,v.public_id,v.market_id,v.legal_name,v.trading_name,v.legal_form,v.tax_number,v.gemi_number,
             COALESCE(va.contact_email::text,vl.public_email::text) AS contact_email,
             COALESCE(va.phone,vl.phone) AS phone,
             COALESCE(va.address_line1,vl.address_line1) AS registered_address,
             concat_ws(', ',NULLIF(vl.address_line1,''),NULLIF(vl.locality,''),NULLIF(vl.postcode,'')) AS shop_address,
             va.primary_category
      FROM vendor_businesses v
      LEFT JOIN LATERAL (
        SELECT contact_email,phone,address_line1,primary_category
        FROM vendor_applications x WHERE x.vendor_id=v.id
        ORDER BY x.updated_at DESC,x.created_at DESC LIMIT 1
      ) va ON true
      LEFT JOIN LATERAL (
        SELECT address_line1,locality,postcode,phone,public_email
        FROM vendor_locations x WHERE x.vendor_id=v.id
        ORDER BY x.is_primary DESC,x.created_at ASC LIMIT 1
      ) vl ON true
      WHERE v.public_id=$1 OR v.id::text=$1
      FOR UPDATE OF v
    `, [vendorId]);
    if (!vendor.rowCount) throw new Error("Vendor not found");
    const v = vendor.rows[0];
    const actorUserId = await resolveActorUserId(client, principal);

    const subscriptionId = optionalText(raw.subscriptionId, "subscriptionId", 160);
    let subscriptionUuid: string | null = null;
    if (subscriptionId) {
      const subscription = await client.query(`SELECT id FROM vendor_subscriptions WHERE (public_id=$1 OR id::text=$1) AND vendor_id=$2`, [subscriptionId, v.id]);
      if (!subscription.rowCount) throw new Error("Vendor subscription not found");
      subscriptionUuid = String(subscription.rows[0].id);
    }

    const vendorSnapshot = {
      vendorPublicId: String(v.public_id),
      legalName: String(v.legal_name),
      tradingName: String(v.trading_name),
      legalForm: optionalText(raw.vendorLegalForm, "vendorLegalForm", 160) ?? (v.legal_form ? String(v.legal_form) : undefined),
      taxNumber: v.tax_number ? String(v.tax_number) : undefined,
      taxOffice: optionalText(raw.vendorTaxOffice, "vendorTaxOffice", 160),
      gemiNumber: v.gemi_number ? String(v.gemi_number) : undefined,
      registeredAddress: optionalText(raw.vendorRegisteredAddress, "vendorRegisteredAddress", 500) ?? (v.registered_address ? String(v.registered_address) : undefined),
      shopAddress: optionalText(raw.vendorShopAddress, "vendorShopAddress", 500) ?? (v.shop_address ? String(v.shop_address) : undefined),
      legalRepresentative: optionalText(raw.vendorLegalRepresentative, "vendorLegalRepresentative", 240),
      contactEmail: optionalText(raw.vendorContactEmail, "vendorContactEmail", 320) ?? (v.contact_email ? String(v.contact_email) : undefined),
      phone: optionalText(raw.vendorPhone, "vendorPhone", 80) ?? (v.phone ? String(v.phone) : undefined),
      iban: optionalText(raw.vendorIban, "vendorIban", 80),
      bankBeneficiary: optionalText(raw.vendorBankBeneficiary, "vendorBankBeneficiary", 240),
      categories: optionalText(raw.vendorCategories, "vendorCategories", 500) ?? (v.primary_category ? String(v.primary_category) : undefined),
      capturedAt: new Date().toISOString()
    };
    if (!vendorSnapshot.contactEmail) throw new Error("Vendor contract email is required");
    if (!vendorSnapshot.registeredAddress) throw new Error("Vendor registered address is required");
    if (!vendorSnapshot.legalRepresentative) throw new Error("Vendor legal representative is required");

    const commercialTermsSnapshot = {
      planName: optionalText(raw.planName, "planName", 160),
      commissionRateBps,
      commissionBase: optionalText(raw.commissionBase, "commissionBase", 240) ?? "merchandise_gross",
      commissionTaxMode,
      commissionTaxRateBps,
      listingFeeMinor,
      recurringFeeMinor,
      recurringFeePeriod,
      settlementTerms: optionalText(raw.settlementTerms, "settlementTerms", 1000),
      paymentProcessingTerms: optionalText(raw.paymentProcessingTerms, "paymentProcessingTerms", 1000),
      contractTerm: optionalText(raw.contractTerm, "contractTerm", 500),
      autoRenewal: optionalText(raw.autoRenewal, "autoRenewal", 500),
      terminationNoticeDays: optionalInteger(raw.terminationNoticeDays, "terminationNoticeDays"),
      specialCommercialTerms: optionalText(raw.specialCommercialTerms, "specialCommercialTerms", 5000),
      orderAcceptanceSla: optionalText(raw.orderAcceptanceSla, "orderAcceptanceSla", 500),
      fulfilmentSla: optionalText(raw.fulfilmentSla, "fulfilmentSla", 500),
      pickupShippingMethods: optionalText(raw.pickupShippingMethods, "pickupShippingMethods", 500),
      stockFreshnessRequirement: optionalText(raw.stockFreshnessRequirement, "stockFreshnessRequirement", 500),
      supportSla: optionalText(raw.supportSla, "supportSla", 500),
      capturedAt: new Date().toISOString()
    };

    const publicId = `agreement_${randomUUID().replaceAll("-","").slice(0,20)}`;
    const inserted = await client.query(`
      INSERT INTO vendor_commercial_agreements(
        id,public_id,market_id,vendor_id,subscription_id,agreement_code,agreement_version,status,
        starts_at,ends_at,commission_rate_bps,commission_basis,commission_tax_mode,
        commission_tax_rate_bps,commission_applies_to_shipping,listing_fee_minor,recurring_fee_minor,
        recurring_fee_period,terms_snapshot,vendor_snapshot,commercial_terms_snapshot,created_by,created_at,updated_at
      ) VALUES(
        $1,$2,$3,$4,$5,'',$6,'data_complete',$7,$8,$9,'merchandise_gross',$10,$11,false,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18,now(),now()
      )
      RETURNING id,agreement_code
    `, [
      randomUUID(), publicId, v.market_id, v.id, subscriptionUuid, agreementVersion, startsAt, endsAt ?? null,
      commissionRateBps, commissionTaxMode, commissionTaxRateBps, listingFeeMinor ?? null, recurringFeeMinor ?? null,
      recurringFeePeriod ?? null,
      JSON.stringify({ commissionAuthority: "individual_vendor_agreement", customerPricePolicy: "vendor_final_price_no_markup" }),
      JSON.stringify(vendorSnapshot), JSON.stringify(commercialTermsSnapshot), actorUserId
    ]);
    await audit(client, { agreementId: String(inserted.rows[0].id), vendorId: String(v.id), action: "agreement_created", toStatus: "data_complete", actorUserId, metadata: { agreementCode: inserted.rows[0].agreement_code } });
    await client.query("COMMIT");
    return { agreementId: publicId, agreementCode: String(inserted.rows[0].agreement_code) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function agreementPdfData(agreementId: string): Promise<{ row: any; data: VendorAgreementPdfData }> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`
    SELECT a.*,v.public_id AS vendor_public_id
    FROM vendor_commercial_agreements a
    JOIN vendor_businesses v ON v.id=a.vendor_id
    WHERE a.public_id=$1 OR a.id::text=$1
  `, [agreementId]);
  if (!result.rowCount) throw new Error("Agreement not found");
  const row = result.rows[0];
  const vendor = record(row.vendor_snapshot) as VendorAgreementPdfData["vendor"];
  const commercial = record(row.commercial_terms_snapshot) as VendorAgreementPdfData["commercial"];
  return {
    row,
    data: {
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
    }
  };
}

export async function generateCommercialAgreementPdf(principal: SessionPrincipal, agreementIdRaw: unknown): Promise<void> {
  const agreementId = text(agreementIdRaw, "agreementId");
  const { row, data } = await agreementPdfData(agreementId);
  if (!["data_complete","pdf_generated"].includes(String(row.status))) throw new Error("PDF can only be generated before the agreement is sent for signature");
  const buffer = await renderVendorAgreementPdf(data);
  const sha256 = pdfHash(buffer);
  const objectKey = pdfObjectKey(String(row.vendor_public_id), String(row.agreement_code), Number(row.agreement_version), "unsigned");
  await storePrivatePdf(objectKey, buffer);

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,vendor_id,status FROM vendor_commercial_agreements WHERE id=$1 FOR UPDATE`, [row.id]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const actorUserId = await resolveActorUserId(client, principal);
    const fromStatus = String(current.rows[0].status);
    if (!["data_complete","pdf_generated"].includes(fromStatus)) throw new Error("Agreement changed while PDF was being generated");
    await client.query(`
      UPDATE vendor_commercial_agreements
      SET unsigned_pdf_object_key=$2,unsigned_pdf_sha256=$3,pdf_generated_at=now(),status='pdf_generated',updated_at=now()
      WHERE id=$1
    `, [row.id, objectKey, sha256]);
    await audit(client, { agreementId: String(row.id), vendorId: String(current.rows[0].vendor_id), action: "pdf_generated", fromStatus, toStatus: "pdf_generated", actorUserId, metadata: { objectKey, sha256, contactEmail: KONTA_MOY_LEGAL_DETAILS.email } });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function emailCommercialAgreementPdf(principal: SessionPrincipal, agreementIdRaw: unknown): Promise<void> {
  const agreementId = text(agreementIdRaw, "agreementId");
  const { row } = await agreementPdfData(agreementId);
  if (!row.unsigned_pdf_object_key) throw new Error("Generate the agreement PDF before sending it");
  const vendorSnapshot = record(row.vendor_snapshot);
  const destination = typeof vendorSnapshot.contactEmail === "string" ? vendorSnapshot.contactEmail.trim() : "";
  if (!destination) throw new Error("Vendor contract email is missing");
  const attachment = await readPrivatePdf(String(row.unsigned_pdf_object_key));
  const config = resendConfigFromEnv();
  const response = await fetch(`${config.baseUrl.replace(/\/$/,"")}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `vendor-agreement-${row.public_id}-${Date.now()}`
    },
    body: JSON.stringify({
      from: config.from,
      to: [destination],
      reply_to: KONTA_MOY_LEGAL_DETAILS.email,
      subject: `KONTA MOY – Συμφωνία συνεργασίας ${row.agreement_code}`,
      text: `Σας αποστέλλουμε τη συμφωνία συνεργασίας ${row.agreement_code} (έκδοση v${row.agreement_version}). Παρακαλούμε ελέγξτε τα στοιχεία και ολοκληρώστε τη συνυπογραφή μέσω gov.gr. Για οποιαδήποτε διευκρίνιση: ${KONTA_MOY_LEGAL_DETAILS.email}.`,
      attachments: [{ filename: `${row.agreement_code}-v${row.agreement_version}-unsigned.pdf`, content: attachment.toString("base64") }]
    })
  });
  const responseBody = await response.json().catch(() => ({})) as { id?: unknown; message?: unknown };
  if (!response.ok) throw new Error(`Agreement email failed (${response.status}): ${typeof responseBody.message === "string" ? responseBody.message : "unexpected response"}`);

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,vendor_id,status FROM vendor_commercial_agreements WHERE id=$1 FOR UPDATE`, [row.id]);
    const actorUserId = await resolveActorUserId(client, principal);
    const fromStatus = String(current.rows[0].status);
    await client.query(`UPDATE vendor_commercial_agreements SET pdf_sent_at=now(),status='pending_signature',updated_at=now() WHERE id=$1`, [row.id]);
    await audit(client, { agreementId: String(row.id), vendorId: String(current.rows[0].vendor_id), action: "pdf_emailed", fromStatus, toStatus: "pending_signature", actorUserId, metadata: { destination, providerMessageId: responseBody.id ?? null } });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function storeSignedCommercialAgreement(principal: SessionPrincipal, input: { agreementId: unknown; govgrReference: unknown; signedAt?: unknown; file: File }): Promise<void> {
  const agreementId = text(input.agreementId, "agreementId");
  const govgrReference = text(input.govgrReference, "govgrReference", 500);
  const signedAt = optionalTimestamp(input.signedAt, "signedAt") ?? new Date();
  if (input.file.size <= 0 || input.file.size > 15 * 1024 * 1024) throw new Error("Signed PDF must be between 1 byte and 15 MB");
  const buffer = Buffer.from(await input.file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("The signed document must be a PDF");

  const { row } = await agreementPdfData(agreementId);
  if (!["pdf_generated","sent","pending_signature","signed_received"].includes(String(row.status))) throw new Error("Signed PDF cannot be attached in the current agreement state");
  if (!row.unsigned_pdf_object_key) throw new Error("The original generated contract PDF is missing");
  const objectKey = pdfObjectKey(String(row.vendor_public_id), String(row.agreement_code), Number(row.agreement_version), "signed-govgr");
  const sha256 = pdfHash(buffer);
  await storePrivatePdf(objectKey, buffer);

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,vendor_id,status FROM vendor_commercial_agreements WHERE id=$1 FOR UPDATE`, [row.id]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const actorUserId = await resolveActorUserId(client, principal);
    const fromStatus = String(current.rows[0].status);
    if (["govgr_verified","eligible_for_activation","active"].includes(fromStatus)) throw new Error("A verified agreement cannot be replaced; create a new agreement version instead");
    await client.query(`
      UPDATE vendor_commercial_agreements
      SET signed_pdf_object_key=$2,signed_pdf_sha256=$3,signed_document_received_at=now(),signed_at=$4,
          govgr_reference=$5,source_document_reference=$5,govgr_verified_at=NULL,govgr_verified_by=NULL,
          status='signed_received',updated_at=now()
      WHERE id=$1
    `, [row.id, objectKey, sha256, signedAt, govgrReference]);
    await audit(client, { agreementId: String(row.id), vendorId: String(current.rows[0].vendor_id), action: "signed_pdf_received", fromStatus, toStatus: "signed_received", actorUserId, metadata: { objectKey, sha256, govgrReference } });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyCommercialAgreementGovgr(principal: SessionPrincipal, raw: Record<string, unknown>): Promise<void> {
  const agreementId = text(raw.agreementId, "agreementId");
  if (raw.confirmed !== true) throw new Error("Explicit gov.gr verification confirmation is required");
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`
      SELECT id,vendor_id,status,signed_pdf_object_key,signed_pdf_sha256,signed_document_received_at,govgr_reference
      FROM vendor_commercial_agreements WHERE public_id=$1 OR id::text=$1 FOR UPDATE
    `, [agreementId]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const row = current.rows[0];
    if (String(row.status) !== "signed_received") throw new Error("Only a received signed agreement can be verified");
    if (!row.signed_pdf_object_key || !row.signed_pdf_sha256 || !row.signed_document_received_at || !row.govgr_reference) throw new Error("Signed PDF and gov.gr reference are required");
    const actorUserId = await resolveActorUserId(client, principal);
    if (!actorUserId) throw new Error("Admin user record is required for verification audit");
    await client.query(`UPDATE vendor_commercial_agreements SET govgr_verified_at=now(),govgr_verified_by=$2,status='govgr_verified',updated_at=now() WHERE id=$1`, [row.id, actorUserId]);
    await audit(client, { agreementId: String(row.id), vendorId: String(row.vendor_id), action: "govgr_reference_verified", fromStatus: "signed_received", toStatus: "govgr_verified", actorUserId, metadata: { govgrReference: row.govgr_reference } });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function activateCommercialAgreement(principal: SessionPrincipal, raw: Record<string, unknown>): Promise<void> {
  const agreementId = text(raw.agreementId, "agreementId");
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`
      SELECT id,vendor_id,status,starts_at,ends_at,signed_at,signed_pdf_object_key,signed_pdf_sha256,
             signed_document_received_at,govgr_reference,govgr_verified_at,govgr_verified_by
      FROM vendor_commercial_agreements WHERE public_id=$1 OR id::text=$1 FOR UPDATE
    `, [agreementId]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const row = current.rows[0];
    if (!["govgr_verified","eligible_for_activation","suspended"].includes(String(row.status))) throw new Error("Agreement is not eligible for activation");
    if (!row.signed_pdf_object_key || !row.signed_pdf_sha256 || !row.signed_document_received_at || !row.govgr_reference || !row.govgr_verified_at || !row.govgr_verified_by) throw new Error("Activation requires a stored signed PDF and verified gov.gr reference");
    const actorUserId = await resolveActorUserId(client, principal);
    if (!actorUserId) throw new Error("Admin user record is required for activation audit");

    await client.query(`
      UPDATE vendor_commercial_agreements
      SET status='superseded',ends_at=LEAST(COALESCE(ends_at,now()),now()),updated_at=now()
      WHERE vendor_id=$1 AND id<>$2 AND status='active'
    `, [row.vendor_id, row.id]);
    await client.query(`
      UPDATE vendor_commercial_agreements
      SET status='active',activated_at=now(),activated_by=$2,updated_at=now()
      WHERE id=$1
    `, [row.id, actorUserId]);
    await client.query(`
      UPDATE vendor_businesses
      SET status='active',contract_started_at=COALESCE(contract_started_at,$2),contract_ended_at=NULL,updated_at=now()
      WHERE id=$1
    `, [row.vendor_id, row.signed_at ?? new Date()]);
    await audit(client, { agreementId: String(row.id), vendorId: String(row.vendor_id), action: "agreement_and_vendor_activated", fromStatus: String(row.status), toStatus: "active", actorUserId, metadata: { govgrReference: row.govgr_reference } });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function changeCommercialAgreementStatus(principal: SessionPrincipal, raw: Record<string, unknown>): Promise<void> {
  const agreementId = text(raw.agreementId, "agreementId");
  const status = text(raw.status, "status", 30) as CommercialAgreementStatus;
  if (!["suspended","expired","terminated","rejected"].includes(status)) throw new Error("Unsupported agreement status; activation uses the verified activation action");
  const endsAt = optionalTimestamp(raw.endsAt, "endsAt");
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT id,vendor_id,status FROM vendor_commercial_agreements WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [agreementId]);
    if (!current.rowCount) throw new Error("Agreement not found");
    const row = current.rows[0];
    const actorUserId = await resolveActorUserId(client, principal);
    await client.query(`
      UPDATE vendor_commercial_agreements
      SET status=$2,ends_at=CASE WHEN $2 IN ('terminated','expired','rejected') THEN COALESCE($3,now()) ELSE COALESCE($3,ends_at) END,updated_at=now()
      WHERE id=$1
    `, [row.id, status, endsAt ?? null]);
    if (status === "suspended") {
      await client.query(`UPDATE vendor_businesses SET status='suspended',updated_at=now() WHERE id=$1 AND status='active'`, [row.vendor_id]);
    } else if (["terminated","expired","rejected"].includes(status)) {
      await client.query(`UPDATE vendor_businesses SET status='restricted',contract_ended_at=now(),updated_at=now() WHERE id=$1 AND status='active'`, [row.vendor_id]);
    }
    await audit(client, { agreementId: String(row.id), vendorId: String(row.vendor_id), action: `agreement_${status}`, fromStatus: String(row.status), toStatus: status, actorUserId });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCommercialAgreementDocument(agreementIdRaw: unknown, kindRaw: unknown): Promise<{ buffer: Buffer; filename: string }> {
  const agreementId = text(agreementIdRaw, "agreementId");
  const kind = text(kindRaw, "document", 20);
  if (!["unsigned","signed"].includes(kind)) throw new Error("document must be unsigned or signed");
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`SELECT agreement_code,agreement_version,unsigned_pdf_object_key,signed_pdf_object_key FROM vendor_commercial_agreements WHERE public_id=$1 OR id::text=$1`, [agreementId]);
  if (!result.rowCount) throw new Error("Agreement not found");
  const row = result.rows[0];
  const objectKey = kind === "signed" ? row.signed_pdf_object_key : row.unsigned_pdf_object_key;
  if (!objectKey) throw new Error(kind === "signed" ? "Signed agreement PDF is not available" : "Generated agreement PDF is not available");
  return {
    buffer: await readPrivatePdf(String(objectKey)),
    filename: `${row.agreement_code}-v${row.agreement_version}-${kind === "signed" ? "signed-govgr" : "unsigned"}.pdf`
  };
}

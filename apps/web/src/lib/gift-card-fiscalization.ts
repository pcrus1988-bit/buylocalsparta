import type { SessionPrincipal } from "@buy-local-sparta/core";
import { configuredMyDataService, myDataAdminRuntimeConfig } from "./mydata-runtime";
import { reconcileCustomerFiscalDocument } from "./customer-fiscal-reconciliation";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const INVOICE_NS = "http://www.aade.gr/myDATA/invoice/v1.0";
const INCOME_NS = "https://www.aade.gr/myDATA/incomeClassificaton/v1.0";
const SPV_EVENT_CODE = "b2c_goods_gr";

const SYSTEM_FISCAL_PRINCIPAL: SessionPrincipal = {
  userId: "system_spv_fiscalization",
  email: "system-spv-fiscalization@kontamou.local",
  roles: ["platform_finance"],
  csrfToken: "system",
  sessionId: "system-spv-fiscalization"
};

export type GiftCardSpvFiscalResult = Readonly<{
  giftCardId: string;
  documentId?: string;
  status: "disabled" | "not_captured" | "ready" | "accepted" | "manual_review";
  documentNumber?: string;
  aadeMark?: string;
  error?: string;
}>;

export async function finalizeGiftCardSpvIssue(giftCardId: string, now = Date.now()): Promise<GiftCardSpvFiscalResult> {
  if (!productionDatabaseConfigured()) return { giftCardId, status: "not_captured" };
  const snapshot = await loadGiftCardDocument(giftCardId);
  if (!snapshot) return { giftCardId, status: "not_captured" };
  if (snapshot.transmissionStatus === "accepted") return resultFromSnapshot(giftCardId, snapshot);

  const config = await myDataAdminRuntimeConfig();
  if (!config.issuanceEnabled) return { ...resultFromSnapshot(giftCardId, snapshot), status: "disabled" };

  // Backfilled historical SPV issues are captured for audit but never auto-numbered retroactively;
  // newly issued paid SPVs are captured by the database trigger and continue through AADE automatically.
  if (snapshot.backfill && !snapshot.documentNumber) {
    const review = "Historical paid SPV issuance captured after the original issue date; accountant review is required before assigning an AADE fiscal number.";
    await markManualReview(snapshot.documentId, review);
    return { giftCardId, documentId: snapshot.documentId, status: "manual_review", error: review };
  }

  if (snapshot.documentNumber && snapshot.transmissionStatus === "manual_review") {
    try {
      await reconcileCustomerFiscalDocument(snapshot.documentId, now);
      return resultFromSnapshot(giftCardId, await loadDocumentSnapshot(snapshot.documentId));
    } catch (error) {
      return { ...resultFromSnapshot(giftCardId, await loadDocumentSnapshot(snapshot.documentId)), error: errorMessage(error) };
    }
  }

  let documentId = snapshot.documentId;
  try {
    if (!snapshot.documentNumber) {
      const prepared = await prepareGiftCardSpvIssueDocument(snapshot.documentId, now);
      documentId = prepared.documentId;
    }
    const service = await configuredMyDataService();
    if (!service) throw new Error("AADE myDATA service is not configured");
    const transmission = await service.transmitPreparedDocument(SYSTEM_FISCAL_PRINCIPAL, { documentId, now });
    if (transmission.ok && transmission.items.length > 0 && !transmission.items.some((item) => item.invoiceMark)) {
      await reconcileCustomerFiscalDocument(documentId, now, { markPendingOnMiss: true });
    }
    return resultFromSnapshot(giftCardId, await loadDocumentSnapshot(documentId));
  } catch (error) {
    const text = errorMessage(error);
    const current = await loadDocumentSnapshot(documentId).catch(() => undefined);
    if (current && !["manual_review", "rejected", "accepted"].includes(current.transmissionStatus)) {
      await recordRetryableFailure(documentId, text).catch(() => undefined);
    }
    return {
      giftCardId,
      documentId,
      status: current?.transmissionStatus === "accepted" ? "accepted" : current?.transmissionStatus === "manual_review" ? "manual_review" : "ready",
      documentNumber: current?.documentNumber ?? undefined,
      aadeMark: current?.aadeMark ?? undefined,
      error: text
    };
  }
}

export async function finalizePendingGiftCardSpvIssues(limit = 5, now = Date.now()): Promise<{ processed: number; accepted: number; manualReview: number; failed: number }> {
  if (!productionDatabaseConfigured()) return { processed: 0, accepted: 0, manualReview: 0, failed: 0 };
  const db = getProductionPostgresRuntime().nativePool;
  const rows = await db.query<{ gift_card_id: string }>(`
    SELECT gc.public_id AS gift_card_id
      FROM tax_documents td
      JOIN gift_cards gc ON gc.id=td.gift_card_id
     WHERE td.type='gift_card_spv_issue'
       AND td.transmission_status IN ('not_ready','ready','manual_review')
       AND td.aade_mark IS NULL
     ORDER BY td.created_at
     LIMIT $1
  `, [limit]);
  let processed = 0, accepted = 0, manualReview = 0, failed = 0;
  for (const row of rows.rows) {
    processed += 1;
    try {
      const result = await finalizeGiftCardSpvIssue(row.gift_card_id, now);
      if (result.status === "accepted") accepted += 1;
      else if (result.status === "manual_review") manualReview += 1;
      else if (result.error) failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, accepted, manualReview, failed };
}

async function prepareGiftCardSpvIssueDocument(documentId: string, now: number): Promise<{ documentId: string; documentNumber: string }> {
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bls_mydata_fiscal_prepare'))");
    const document = await client.query<{
      document_uuid: string; public_id: string; type: string; transmission_status: string; document_number: string | null;
      market_id: string; currency: string; net_minor: string | number; tax_minor: string | number; gross_minor: string | number;
      payload_snapshot: Record<string, unknown>; voucher_type: string; voucher_vat_rate_bps: number; voucher_tax_country: string;
      gift_card_public_id: string;
    }>(`
      SELECT td.id::text AS document_uuid,td.public_id,td.type,td.transmission_status,td.document_number,
             td.market_id::text,td.currency,td.net_minor,td.tax_minor,td.gross_minor,td.payload_snapshot,
             gc.voucher_type,gc.voucher_vat_rate_bps,gc.voucher_tax_country,gc.public_id AS gift_card_public_id
        FROM tax_documents td
        JOIN gift_cards gc ON gc.id=td.gift_card_id
       WHERE td.public_id=$1
       FOR UPDATE OF td
    `, [documentId]);
    if (!document.rowCount) throw new Error("SPV tax document not found");
    const d = document.rows[0]!;
    if (d.type !== "gift_card_spv_issue") throw new Error("Tax document is not an SPV issuance document");
    if (d.document_number) {
      await client.query("COMMIT");
      return { documentId: d.public_id, documentNumber: d.document_number };
    }
    if (d.voucher_type !== "single_purpose" || Number(d.voucher_vat_rate_bps) !== 2400 || d.voucher_tax_country !== "GR") {
      throw new Error("Only Greek 24% single-purpose Gift Cards can use the automated SPV fiscal path");
    }

    const policy = await client.query<{ id: string; public_id: string; version: string; policy_hash: string | null; seller_tax_number: string; fiscalisation_route: string }>(`
      SELECT id::text,public_id,version,policy_hash,seller_tax_number,fiscalisation_route
        FROM accounting_tax_policies
       WHERE market_id=$1::uuid AND status='approved'
       ORDER BY approved_at DESC
       LIMIT 1 FOR SHARE
    `, [d.market_id]);
    if (!policy.rowCount) throw new Error("No approved Accounting Policy exists for the SPV market");
    const p = policy.rows[0]!;
    if (p.fiscalisation_route !== "aade_direct_erp") throw new Error("SPV fiscalization requires the approved AADE Direct ERP route");

    const mapping = await client.query<{ invoice_type: string; income_category: string | null; e3_code: string | null; series_code: string; production_status: string }>(`
      SELECT invoice_type,income_category,e3_code,series_code,production_status
        FROM mydata_document_mappings
       WHERE policy_id=$1::uuid AND event_code=$2
       LIMIT 1
    `, [p.id, SPV_EVENT_CODE]);
    if (!mapping.rowCount || mapping.rows[0]!.production_status !== "approved") throw new Error("Approved B2C goods mapping is required for SPV issuance");
    const m = mapping.rows[0]!;
    if (m.invoice_type !== "11.1" || !m.income_category || !m.e3_code) throw new Error("SPV issuance requires approved retail-goods mapping 11.1 with income classification");

    const payment = await client.query<{ mydata_payment_type: number; production_status: string }>(`
      SELECT mydata_payment_type,production_status
        FROM mydata_payment_mappings
       WHERE policy_id=$1::uuid AND processor='OFFLINE' AND processor_method='CASH'
       LIMIT 1
    `, [p.id]);
    if (!payment.rowCount || payment.rows[0]!.production_status !== "approved" || Number(payment.rows[0]!.mydata_payment_type) !== 3) {
      throw new Error("Approved OFFLINE/CASH myDATA payment mapping is required for vendor-physical SPV issuance");
    }

    const issueDate = athensDate(now);
    const series = await client.query<{ id: string; series: string; next_aa: string | number; fiscal_year: number; locked: boolean; invoice_type: string }>(`
      SELECT id::text,series,next_aa,fiscal_year,locked,invoice_type
        FROM mydata_fiscal_series
       WHERE market_id=$1::uuid AND series=$2
       FOR UPDATE
    `, [d.market_id, m.series_code]);
    if (!series.rowCount) throw new Error(`Fiscal series ${m.series_code} is not configured`);
    const s = series.rows[0]!;
    if (s.locked) throw new Error(`Fiscal series ${s.series} is locked`);
    if (Number(s.fiscal_year) !== Number(issueDate.slice(0, 4))) throw new Error(`Fiscal series ${s.series} is not valid for ${issueDate}`);
    const aa = String(integer(s.next_aa));
    const documentNumber = `${s.series}-${aa}`;
    const netMinor = integer(d.net_minor), taxMinor = integer(d.tax_minor), grossMinor = integer(d.gross_minor);
    if (netMinor + taxMinor !== grossMinor || grossMinor <= 0) throw new Error("SPV fiscal totals are invalid");

    const xml = buildSpvXml({
      sellerTaxNumber: p.seller_tax_number,
      series: s.series,
      aa,
      issueDate,
      invoiceType: m.invoice_type,
      currency: d.currency.trim(),
      netMinor,
      taxMinor,
      grossMinor,
      incomeCategory: m.income_category,
      e3Code: m.e3_code
    });
    const payload = record(d.payload_snapshot);
    const preparedPayload = {
      ...payload,
      lifecycle: "prepared_for_aade",
      preparedAt: new Date(now).toISOString(),
      preparation: {
        eventCode: SPV_EVENT_CODE,
        fiscalEvent: "single_purpose_voucher_issue",
        accountingPolicyPublicId: p.public_id,
        policyVersion: p.version,
        policyHash: p.policy_hash,
        invoiceType: m.invoice_type,
        series: s.series,
        aa,
        issueDate,
        payment: {
          processor: "OFFLINE",
          processorMethod: "CASH",
          mydataPaymentType: 3,
          transactionId: null,
          remoteEcommerce: false,
          posInterconnectionExempt: false
        },
        voucher: {
          giftCardId: d.gift_card_public_id,
          voucherType: d.voucher_type,
          vatRateBps: 2400,
          taxCountry: d.voucher_tax_country,
          vatRecognizedAtIssue: true,
          redemptionCreatesIndependentTaxableTransaction: false
        },
        lines: [{ lineId: `spv:${d.gift_card_public_id}`, vatCategory: 1, vatRateBps: 2400, netMinor, vatMinor: taxMinor, grossMinor }]
      },
      mydataXml: xml
    };

    const updated = await client.query(`
      UPDATE tax_documents
         SET document_number=$2,mapping_version=$3,invoice_type_code=$4,document_series=$5,document_aa=$6,
             issue_date=$7::date,accounting_policy_id=$8::uuid,fiscalisation_route='aade_direct_erp',
             payment_processor='OFFLINE',payment_processor_method='CASH',mydata_payment_type=3,
             payment_transaction_id=NULL,payment_tid=NULL,provider_payment_signature=NULL,ecr_token=NULL,
             payload_snapshot=$9::jsonb,transmission_status='ready',last_error=NULL
       WHERE id=$1::uuid AND type='gift_card_spv_issue' AND document_number IS NULL
    `, [d.document_uuid, documentNumber, p.version, m.invoice_type, s.series, aa, issueDate, p.id, JSON.stringify(preparedPayload)]);
    if (!updated.rowCount) throw new Error("SPV tax document changed while being prepared");
    await client.query("UPDATE mydata_fiscal_series SET next_aa=next_aa+1,updated_at=now() WHERE id=$1::uuid", [s.id]);
    await client.query("COMMIT");
    return { documentId: d.public_id, documentNumber };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

type Snapshot = Readonly<{
  documentId: string;
  documentNumber: string | null;
  transmissionStatus: string;
  aadeMark: string | null;
  lastError: string | null;
  backfill: boolean;
}>;

async function loadGiftCardDocument(giftCardId: string): Promise<Snapshot | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<{
    public_id: string; document_number: string | null; transmission_status: string; aade_mark: string | null; last_error: string | null; payload_snapshot: Record<string, unknown>;
  }>(`
    SELECT td.public_id,td.document_number,td.transmission_status,td.aade_mark,td.last_error,td.payload_snapshot
      FROM tax_documents td
      JOIN gift_cards gc ON gc.id=td.gift_card_id
     WHERE gc.public_id=$1 AND td.type='gift_card_spv_issue'
     LIMIT 1
  `, [giftCardId]);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    documentId: row.public_id,
    documentNumber: row.document_number,
    transmissionStatus: row.transmission_status,
    aadeMark: row.aade_mark,
    lastError: row.last_error,
    backfill: record(row.payload_snapshot).capturedFrom === "gift_card_issue_ledger_backfill"
  };
}

async function loadDocumentSnapshot(documentId: string): Promise<Snapshot> {
  const result = await getProductionPostgresRuntime().nativePool.query<{
    public_id: string; document_number: string | null; transmission_status: string; aade_mark: string | null; last_error: string | null; payload_snapshot: Record<string, unknown>;
  }>("SELECT public_id,document_number,transmission_status,aade_mark,last_error,payload_snapshot FROM tax_documents WHERE public_id=$1 LIMIT 1", [documentId]);
  const row = result.rows[0];
  if (!row) throw new Error("SPV tax document not found");
  return {
    documentId: row.public_id,
    documentNumber: row.document_number,
    transmissionStatus: row.transmission_status,
    aadeMark: row.aade_mark,
    lastError: row.last_error,
    backfill: record(row.payload_snapshot).capturedFrom === "gift_card_issue_ledger_backfill"
  };
}

async function markManualReview(documentId: string, error: string): Promise<void> {
  await getProductionPostgresRuntime().nativePool.query(
    "UPDATE tax_documents SET transmission_status='manual_review',last_error=$2 WHERE public_id=$1 AND aade_mark IS NULL",
    [documentId, error.slice(0, 1000)]
  );
}

async function recordRetryableFailure(documentId: string, error: string): Promise<void> {
  await getProductionPostgresRuntime().nativePool.query(
    "UPDATE tax_documents SET last_error=$2 WHERE public_id=$1 AND transmission_status IN ('not_ready','ready') AND aade_mark IS NULL",
    [documentId, error.slice(0, 1000)]
  );
}

function resultFromSnapshot(giftCardId: string, snapshot: Snapshot): GiftCardSpvFiscalResult {
  const status: GiftCardSpvFiscalResult["status"] =
    snapshot.transmissionStatus === "accepted" ? "accepted" :
    snapshot.transmissionStatus === "manual_review" ? "manual_review" :
    "ready";
  return {
    giftCardId,
    documentId: snapshot.documentId,
    status,
    documentNumber: snapshot.documentNumber ?? undefined,
    aadeMark: snapshot.aadeMark ?? undefined,
    error: snapshot.lastError ?? undefined
  };
}

function buildSpvXml(input: {
  sellerTaxNumber: string; series: string; aa: string; issueDate: string; invoiceType: string; currency: string;
  netMinor: number; taxMinor: number; grossMinor: number; incomeCategory: string; e3Code: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?><InvoicesDoc xmlns="${INVOICE_NS}" xmlns:icls="${INCOME_NS}"><invoice><issuer><vatNumber>${escapeXml(input.sellerTaxNumber)}</vatNumber><country>GR</country><branch>0</branch></issuer><invoiceHeader><series>${escapeXml(input.series)}</series><aa>${escapeXml(input.aa)}</aa><issueDate>${input.issueDate}</issueDate><invoiceType>${escapeXml(input.invoiceType)}</invoiceType><currency>${escapeXml(input.currency)}</currency></invoiceHeader><paymentMethods><paymentMethodDetails><type>3</type><amount>${money(input.grossMinor)}</amount><paymentMethodInfo>Single-purpose voucher issuance</paymentMethodInfo></paymentMethodDetails></paymentMethods><invoiceDetails><lineNumber>1</lineNumber><quantity>1</quantity><measurementUnit>1</measurementUnit><netValue>${money(input.netMinor)}</netValue><vatCategory>1</vatCategory><vatAmount>${money(input.taxMinor)}</vatAmount><incomeClassification><icls:classificationType>${escapeXml(input.e3Code)}</icls:classificationType><icls:classificationCategory>${escapeXml(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(input.netMinor)}</icls:amount></incomeClassification></invoiceDetails><invoiceSummary><totalNetValue>${money(input.netMinor)}</totalNetValue><totalVatAmount>${money(input.taxMinor)}</totalVatAmount><totalWithheldAmount>0.00</totalWithheldAmount><totalFeesAmount>0.00</totalFeesAmount><totalStampDutyAmount>0.00</totalStampDutyAmount><totalOtherTaxesAmount>0.00</totalOtherTaxesAmount><totalDeductionsAmount>0.00</totalDeductionsAmount><totalGrossValue>${money(input.grossMinor)}</totalGrossValue><incomeClassification><icls:classificationType>${escapeXml(input.e3Code)}</icls:classificationType><icls:classificationCategory>${escapeXml(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(input.netMinor)}</icls:amount></incomeClassification></invoiceSummary></invoice></InvoicesDoc>`;
}

function athensDate(now: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function integer(value: unknown): number { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error("Expected safe integer"); return n; }
function money(minor: number): string { return (minor / 100).toFixed(2); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function escapeXml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

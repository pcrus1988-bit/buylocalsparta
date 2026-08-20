import { AadeMyDataClient } from "@buy-local-sparta/aade-mydata";
import { resolveMyDataDiagnosticConfig } from "./mydata-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerFiscalReconciliation = Readonly<{
  accepted: boolean;
  found: boolean;
  mark?: string;
  uid?: string;
  qrUrl?: string;
  pagesChecked: number;
}>;

type TargetDocument = Readonly<{
  documentUuid: string;
  documentId: string;
  marketId: string;
  series: string;
  aa: number;
  issueDate: string;
  invoiceType: string;
  grossMinor: number;
  attemptUuid: string;
  attemptKey: string;
}>;

type TransmittedInvoice = Readonly<{
  mark: string;
  uid?: string;
  qrUrl?: string;
  series: string;
  aa: string;
  issueDate: string;
  invoiceType: string;
  grossMinor?: number;
}>;

export async function reconcileCustomerFiscalDocument(documentId: string, now = Date.now()): Promise<CustomerFiscalReconciliation> {
  if (!productionDatabaseConfigured()) return { accepted: false, found: false, pagesChecked: 0 };
  const db = getProductionPostgresRuntime().nativePool;
  const target = await loadTarget(documentId);
  if (!target) {
    const existing = await db.query<{ aade_mark: string | null; aade_uid: string | null; aade_qr_url: string | null }>(
      `SELECT aade_mark,aade_uid,aade_qr_url FROM tax_documents WHERE public_id=$1 LIMIT 1`,
      [documentId]
    );
    const row = existing.rows[0];
    if (row?.aade_mark) return { accepted: true, found: true, mark: row.aade_mark, uid: row.aade_uid ?? undefined, qrUrl: row.aade_qr_url ?? undefined, pagesChecked: 0 };
    return { accepted: false, found: false, pagesChecked: 0 };
  }

  const resolved = await resolveMyDataDiagnosticConfig();
  if (!resolved) throw new Error("AADE myDATA credentials are not configured for reconciliation");
  const client = new AadeMyDataClient(resolved.config);
  const queryDate = toAadeDate(target.issueDate);
  let nextPartitionKey: string | undefined;
  let nextRowKey: string | undefined;
  let pagesChecked = 0;
  const seenCursors = new Set<string>();

  for (let page = 0; page < 20; page += 1) {
    const xml = await client.requestTransmittedDocs({
      mark: "0",
      dateFrom: queryDate,
      dateTo: queryDate,
      nextPartitionKey,
      nextRowKey
    });
    pagesChecked += 1;
    const parsed = parseRequestedDocs(xml);
    const match = parsed.invoices.find((invoice) => matches(invoice, target));
    if (match) {
      await acceptReconciledDocument(target, match, pagesChecked, now);
      return { accepted: true, found: true, mark: match.mark, uid: match.uid, qrUrl: match.qrUrl, pagesChecked };
    }
    if (!parsed.nextPartitionKey || !parsed.nextRowKey) break;
    const cursor = `${parsed.nextPartitionKey}\u0000${parsed.nextRowKey}`;
    if (seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
    nextPartitionKey = parsed.nextPartitionKey;
    nextRowKey = parsed.nextRowKey;
  }

  await markReconciliationPending(target, pagesChecked, now);
  return { accepted: false, found: false, pagesChecked };
}

async function loadTarget(documentId: string): Promise<TargetDocument | undefined> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<{
    document_uuid: string;
    public_id: string;
    market_id: string;
    document_series: string | null;
    document_aa: string | number | null;
    issue_date: Date | string | null;
    invoice_type_code: string | null;
    gross_minor: string | number;
    aade_mark: string | null;
    attempt_uuid: string | null;
    attempt_key: string | null;
  }>(`SELECT td.id::text AS document_uuid,td.public_id,td.market_id::text,td.document_series,td.document_aa,td.issue_date,td.invoice_type_code,td.gross_minor,td.aade_mark,
             a.id::text AS attempt_uuid,a.attempt_key
        FROM tax_documents td
        LEFT JOIN LATERAL (
          SELECT x.id,x.attempt_key FROM mydata_transmission_attempts x
          WHERE x.tax_document_id=td.id AND x.operation='send_invoice'
          ORDER BY x.started_at DESC LIMIT 1
        ) a ON true
       WHERE td.public_id=$1 LIMIT 1`, [documentId]);
  const row = result.rows[0];
  if (!row || row.aade_mark) return undefined;
  if (!row.attempt_uuid || !row.attempt_key) return undefined;
  if (!row.document_series || row.document_aa == null || !row.issue_date || !row.invoice_type_code) return undefined;
  const aa = Number(row.document_aa);
  const grossMinor = Number(row.gross_minor);
  if (!Number.isSafeInteger(aa) || aa <= 0 || !Number.isSafeInteger(grossMinor) || grossMinor < 0) return undefined;
  const issueDate = dbDate(row.issue_date);
  return {
    documentUuid: row.document_uuid,
    documentId: row.public_id,
    marketId: row.market_id,
    series: row.document_series,
    aa,
    issueDate,
    invoiceType: row.invoice_type_code,
    grossMinor,
    attemptUuid: row.attempt_uuid,
    attemptKey: row.attempt_key
  };
}

async function acceptReconciledDocument(target: TargetDocument, invoice: TransmittedInvoice, pagesChecked: number, now: number): Promise<void> {
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE tax_documents
          SET transmission_status='accepted',status='issued',aade_mark=$2,aade_uid=$3,aade_qr_url=$4,
              provider='aade_mydata_erp',provider_document_id=$2,last_error=NULL,last_transmission_at=$5,
              issued_at=COALESCE(issued_at,$5)
        WHERE id=$1::uuid AND aade_mark IS NULL`,
      [target.documentUuid, invoice.mark, invoice.uid ?? null, invoice.qrUrl ?? null, new Date(now)]
    );
    if (updated.rowCount) {
      await client.query(
        `UPDATE mydata_transmission_attempts
            SET status='accepted',response_snapshot=COALESCE(response_snapshot,'{}'::jsonb)||$2::jsonb,completed_at=COALESCE(completed_at,$3)
          WHERE id=$1::uuid`,
        [target.attemptUuid, JSON.stringify({ reconciliation: { found: true, pagesChecked, mark: invoice.mark, uid: invoice.uid ?? null, qrUrl: invoice.qrUrl ?? null, reconciledAt: new Date(now).toISOString() } }), new Date(now)]
      );
      await client.query(
        `UPDATE mydata_fiscal_series
            SET last_issued_aa=GREATEST(COALESCE(last_issued_aa,0),$3),last_mark=$4,updated_at=$5
          WHERE market_id=$1::uuid AND series=$2`,
        [target.marketId, target.series, target.aa, invoice.mark, new Date(now)]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function markReconciliationPending(target: TargetDocument, pagesChecked: number, now: number): Promise<void> {
  const db = getProductionPostgresRuntime().nativePool;
  const message = `AADE transmission outcome requires reconciliation: the transmitted document was not found after ${pagesChecked} RequestTransmittedDocs page(s). Automatic resend is blocked.`;
  await db.query(
    `UPDATE tax_documents
        SET transmission_status='manual_review',status=CASE WHEN status='rejected' THEN 'pending' ELSE status END,last_error=$2,last_transmission_at=$3
      WHERE id=$1::uuid AND aade_mark IS NULL`,
    [target.documentUuid, message, new Date(now)]
  );
  await db.query(
    `UPDATE mydata_transmission_attempts
        SET status=CASE WHEN status='accepted' THEN status ELSE 'manual_review' END,
            response_snapshot=COALESCE(response_snapshot,'{}'::jsonb)||$2::jsonb,completed_at=COALESCE(completed_at,$3)
      WHERE id=$1::uuid`,
    [target.attemptUuid, JSON.stringify({ reconciliation: { found: false, pagesChecked, reconciledAt: new Date(now).toISOString() } }), new Date(now)]
  );
}

function parseRequestedDocs(xml: string): { invoices: TransmittedInvoice[]; nextPartitionKey?: string; nextRowKey?: string } {
  const invoices: TransmittedInvoice[] = [];
  for (const match of xml.matchAll(/<(?:\w+:)?invoice\b[^>]*>([\s\S]*?)<\/(?:\w+:)?invoice>/gi)) {
    const block = match[1] ?? "";
    const header = innerTag(block, "invoiceHeader");
    if (!header) continue;
    const mark = tag(block, "mark");
    const series = tag(header, "series");
    const aa = tag(header, "aa");
    const issueDate = tag(header, "issueDate");
    const invoiceType = tag(header, "invoiceType");
    if (!mark || !/^\d+$/.test(mark) || !series || !aa || !issueDate || !invoiceType) continue;
    const summary = innerTag(block, "invoiceSummary");
    const grossText = summary ? tag(summary, "totalGrossValue") : undefined;
    invoices.push({
      mark,
      uid: tag(block, "uid"),
      qrUrl: tag(block, "qrUrl") ?? tag(block, "qrCodeUrl"),
      series,
      aa,
      issueDate,
      invoiceType,
      grossMinor: grossText == null ? undefined : moneyToMinor(grossText)
    });
  }
  return {
    invoices,
    nextPartitionKey: tag(xml, "nextPartitionKey"),
    nextRowKey: tag(xml, "nextRowKey")
  };
}

function matches(invoice: TransmittedInvoice, target: TargetDocument): boolean {
  if (invoice.series !== target.series || invoice.aa !== String(target.aa) || invoice.issueDate !== target.issueDate || invoice.invoiceType !== target.invoiceType) return false;
  return invoice.grossMinor == null || invoice.grossMinor === target.grossMinor;
}

function innerTag(xml: string, name: string): string | undefined {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match?.[1];
}

function tag(xml: string, name: string): string | undefined {
  const inner = innerTag(xml, name)?.trim();
  return inner ? decodeXml(inner.replace(/<[^>]+>/g, "").trim()) : undefined;
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function moneyToMinor(value: string): number | undefined {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return undefined;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function dbDate(value: Date | string): string {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1]!;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid tax-document issue date");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const fields = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function toAadeDate(issueDate: string): string {
  const match = issueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Invalid tax-document issue date for AADE reconciliation");
  return `${match[3]}/${match[2]}/${match[1]}`;
}

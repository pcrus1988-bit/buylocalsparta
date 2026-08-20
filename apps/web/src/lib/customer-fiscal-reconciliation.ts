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

export type CustomerFiscalReconciliationOptions = Readonly<{
  markPendingOnMiss?: boolean;
}>;

type TargetDocument = Readonly<{
  documentUuid: string;
  documentId: string;
  marketId: string;
  entityVatNumber: string;
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

type SearchDiagnostic = Readonly<{
  strategy: "issuer_issue_date" | "issuer_broad_invoice_type" | "representative_issue_date" | "representative_broad_invoice_type";
  entityVatNumberApplied: boolean;
  pagesChecked: number;
  invoicesParsed: number;
  identities: readonly string[];
}>;

export async function reconcileCustomerFiscalDocument(
  documentId: string,
  now = Date.now(),
  options: CustomerFiscalReconciliationOptions = {}
): Promise<CustomerFiscalReconciliation> {
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
  const diagnostics: SearchDiagnostic[] = [];

  // AADE identifies the authenticated ERP user from the request credentials. For the
  // issuer's own documents, entityVatNumber must not be forced into the request: that
  // parameter is for requests performed on behalf of another entity. Try the authenticated
  // issuer view first and retain an explicit-entity fallback for representative credentials.
  const searches: ReadonlyArray<Readonly<{
    strategy: SearchDiagnostic["strategy"];
    dateFrom?: string;
    dateTo?: string;
    maxPages: number;
    includeEntityVatNumber: boolean;
  }>> = [
    { strategy: "issuer_issue_date", dateFrom: queryDate, dateTo: queryDate, maxPages: 20, includeEntityVatNumber: false },
    { strategy: "issuer_broad_invoice_type", maxPages: 50, includeEntityVatNumber: false },
    { strategy: "representative_issue_date", dateFrom: queryDate, dateTo: queryDate, maxPages: 20, includeEntityVatNumber: true },
    { strategy: "representative_broad_invoice_type", maxPages: 50, includeEntityVatNumber: true }
  ];

  for (const search of searches) {
    const result = await searchTransmittedDocs(client, target, search);
    diagnostics.push(result.diagnostic);
    if (result.match) {
      const pagesChecked = diagnostics.reduce((sum, item) => sum + item.pagesChecked, 0);
      await acceptReconciledDocument(target, result.match, pagesChecked, diagnostics, now);
      return { accepted: true, found: true, mark: result.match.mark, uid: result.match.uid, qrUrl: result.match.qrUrl, pagesChecked };
    }
  }

  const pagesChecked = diagnostics.reduce((sum, item) => sum + item.pagesChecked, 0);
  if (options.markPendingOnMiss !== false) await markReconciliationPending(target, pagesChecked, diagnostics, now);
  else await recordReconciliationProbe(target, pagesChecked, diagnostics, now);
  return { accepted: false, found: false, pagesChecked };
}

async function searchTransmittedDocs(
  client: AadeMyDataClient,
  target: TargetDocument,
  input: Readonly<{
    strategy: SearchDiagnostic["strategy"];
    dateFrom?: string;
    dateTo?: string;
    maxPages: number;
    includeEntityVatNumber: boolean;
  }>
): Promise<{ match?: TransmittedInvoice; diagnostic: SearchDiagnostic }> {
  let nextPartitionKey: string | undefined;
  let nextRowKey: string | undefined;
  let pagesChecked = 0;
  let invoicesParsed = 0;
  const identities: string[] = [];
  const seenCursors = new Set<string>();

  for (let page = 0; page < input.maxPages; page += 1) {
    const xml = await client.requestTransmittedDocs({
      mark: "0",
      ...(input.includeEntityVatNumber ? { entityVatNumber: target.entityVatNumber } : {}),
      invType: target.invoiceType,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      nextPartitionKey,
      nextRowKey
    });
    pagesChecked += 1;
    const parsed = parseRequestedDocs(xml);
    invoicesParsed += parsed.invoices.length;
    for (const invoice of parsed.invoices.slice(0, 10)) {
      if (identities.length >= 25) break;
      identities.push(invoiceIdentity(invoice));
    }
    const match = parsed.invoices.find((invoice) => matches(invoice, target));
    if (match) {
      return {
        match,
        diagnostic: {
          strategy: input.strategy,
          entityVatNumberApplied: input.includeEntityVatNumber,
          pagesChecked,
          invoicesParsed,
          identities
        }
      };
    }
    if (!parsed.nextPartitionKey || !parsed.nextRowKey) break;
    const cursor = `${parsed.nextPartitionKey}\u0000${parsed.nextRowKey}`;
    if (seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
    nextPartitionKey = parsed.nextPartitionKey;
    nextRowKey = parsed.nextRowKey;
  }

  return {
    diagnostic: {
      strategy: input.strategy,
      entityVatNumberApplied: input.includeEntityVatNumber,
      pagesChecked,
      invoicesParsed,
      identities
    }
  };
}

async function loadTarget(documentId: string): Promise<TargetDocument | undefined> {
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<{
    document_uuid: string;
    public_id: string;
    market_id: string;
    seller_tax_number: string | null;
    document_series: string | null;
    document_aa: string | number | null;
    issue_date: Date | string | null;
    invoice_type_code: string | null;
    gross_minor: string | number;
    aade_mark: string | null;
    attempt_uuid: string | null;
    attempt_key: string | null;
  }>(`SELECT td.id::text AS document_uuid,td.public_id,td.market_id::text,p.seller_tax_number,td.document_series,td.document_aa,td.issue_date,td.invoice_type_code,td.gross_minor,td.aade_mark,
             a.id::text AS attempt_uuid,a.attempt_key
        FROM tax_documents td
        LEFT JOIN accounting_tax_policies p ON p.id=td.accounting_policy_id
        LEFT JOIN LATERAL (
          SELECT x.id,x.attempt_key FROM mydata_transmission_attempts x
          WHERE x.tax_document_id=td.id AND x.operation='send_invoice'
          ORDER BY x.started_at DESC LIMIT 1
        ) a ON true
       WHERE td.public_id=$1 LIMIT 1`, [documentId]);
  const row = result.rows[0];
  if (!row || row.aade_mark) return undefined;
  if (!row.attempt_uuid || !row.attempt_key) return undefined;
  if (!row.seller_tax_number || !/^\d{9}$/.test(row.seller_tax_number)) throw new Error("Tax document is missing its approved seller VAT number");
  if (!row.document_series || row.document_aa == null || !row.issue_date || !row.invoice_type_code) return undefined;
  const aa = Number(row.document_aa);
  const grossMinor = Number(row.gross_minor);
  if (!Number.isSafeInteger(aa) || aa <= 0 || !Number.isSafeInteger(grossMinor) || grossMinor < 0) return undefined;
  const issueDate = dbDate(row.issue_date);
  return {
    documentUuid: row.document_uuid,
    documentId: row.public_id,
    marketId: row.market_id,
    entityVatNumber: row.seller_tax_number,
    series: row.document_series,
    aa,
    issueDate,
    invoiceType: row.invoice_type_code,
    grossMinor,
    attemptUuid: row.attempt_uuid,
    attemptKey: row.attempt_key
  };
}

async function acceptReconciledDocument(target: TargetDocument, invoice: TransmittedInvoice, pagesChecked: number, diagnostics: readonly SearchDiagnostic[], now: number): Promise<void> {
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
        [target.attemptUuid, JSON.stringify({ reconciliation: { found: true, pagesChecked, diagnostics, mark: invoice.mark, uid: invoice.uid ?? null, qrUrl: invoice.qrUrl ?? null, reconciledAt: new Date(now).toISOString() } }), new Date(now)]
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

async function recordReconciliationProbe(target: TargetDocument, pagesChecked: number, diagnostics: readonly SearchDiagnostic[], now: number): Promise<void> {
  const db = getProductionPostgresRuntime().nativePool;
  await db.query(
    `UPDATE mydata_transmission_attempts
        SET response_snapshot=COALESCE(response_snapshot,'{}'::jsonb)||$2::jsonb
      WHERE id=$1::uuid`,
    [target.attemptUuid, JSON.stringify({ reconciliationProbe: { found: false, pagesChecked, diagnostics, checkedAt: new Date(now).toISOString() } })]
  );
}

async function markReconciliationPending(target: TargetDocument, pagesChecked: number, diagnostics: readonly SearchDiagnostic[], now: number): Promise<void> {
  const db = getProductionPostgresRuntime().nativePool;
  const message = `AADE transmission outcome requires reconciliation: the transmitted document was not found after ${pagesChecked} read-only RequestTransmittedDocs page(s). Automatic resend is blocked.`;
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
    [target.attemptUuid, JSON.stringify({ reconciliation: { found: false, pagesChecked, diagnostics, reconciledAt: new Date(now).toISOString() } }), new Date(now)]
  );
}

function parseRequestedDocs(xml: string): { invoices: TransmittedInvoice[]; nextPartitionKey?: string; nextRowKey?: string } {
  const invoices: TransmittedInvoice[] = [];
  for (const match of xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?invoice\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?invoice>/gi)) {
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

function invoiceIdentity(invoice: TransmittedInvoice): string {
  return `${invoice.series}/${invoice.aa}/${invoice.issueDate}/${invoice.invoiceType}/${invoice.grossMinor ?? "?"}/${invoice.mark}`;
}

function innerTag(xml: string, name: string): string | undefined {
  const prefix = "(?:[A-Za-z_][\\w.-]*:)?";
  const match = xml.match(new RegExp(`<${prefix}${name}\\b[^>]*>([\\s\\S]*?)<\\/${prefix}${name}>`, "i"));
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

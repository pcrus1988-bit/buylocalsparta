import { PostgresUnitOfWork, type SqlPool, type SqlRow } from "@buy-local-sparta/core";

export type FiscalCustomerDocumentType = "retail_receipt" | "customer_invoice";

export type FiscalMaterializationResult = Readonly<{
  documentId: string;
  documentType: FiscalCustomerDocumentType;
  created: boolean;
}>;

export type FiscalDocumentProjection = Readonly<{
  id: string;
  orderId?: string;
  type: string;
  status: string;
  transmissionStatus: string;
  grossMinor: number;
  currency: string;
  mappingVersion?: string;
  invoiceTypeCode?: string;
  documentNumber?: string;
  aadeMark?: string;
  aadeUid?: string;
  qrUrl?: string;
  lastError?: string;
  createdAt: number;
}>;

export class FiscalWorkError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = "FiscalWorkError";
    this.retryable = retryable;
  }
}

export class PostgresFiscalWorkService {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  }

  async lockCheckoutSnapshot(input: {
    customerId: string;
    orderId: string;
    snapshot: Readonly<Record<string, unknown>>;
    now: number;
  }): Promise<void> {
    const customerId = bounded(input.customerId, 128, "Customer ID");
    const orderId = bounded(input.orderId, 128, "Order ID");
    const documentType = optionalText(input.snapshot.documentType);
    if (documentType !== "receipt" && documentType !== "invoice") throw new FiscalWorkError("Fiscal checkout snapshot must select receipt or invoice");
    if (input.snapshot.source !== "checkout_address_lock") throw new FiscalWorkError("Fiscal checkout snapshot must be derived from the locked billing address");

    await this.#uow.withTransaction({ actorUserId: customerId, marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT o.id::text AS order_uuid,o.checkout_address_locked_at,o.billing_address_snapshot
          FROM customer_orders o
          JOIN users u ON u.id=o.user_id
         WHERE (o.public_id=$1 OR o.id::text=$1)
           AND (u.public_id=$2 OR u.id::text=$2)
         FOR UPDATE OF o
      `, [orderId, customerId]);
      if (result.rowCount !== 1) throw new FiscalWorkError("Order not found for fiscal checkout lock");
      const row = result.rows[0];
      if (!row.checkout_address_locked_at) throw new FiscalWorkError("Billing address must be locked before the fiscal document choice");
      const billing = object(row.billing_address_snapshot);
      const existing = billing.fiscal;
      if (existing !== undefined) {
        if (!sameFiscalIdentity(existing, input.snapshot)) throw new FiscalWorkError("The order fiscal document choice is already locked and cannot be changed");
        return;
      }
      const updated = await tx.query<SqlRow>(`
        UPDATE customer_orders
           SET billing_address_snapshot=jsonb_set(billing_address_snapshot,'{fiscal}',$2::jsonb,true),updated_at=$3
         WHERE id=$1
           AND checkout_address_locked_at IS NOT NULL
           AND NOT (billing_address_snapshot ? 'fiscal')
         RETURNING id
      `, [text(row.order_uuid, "order_uuid"), JSON.stringify(input.snapshot), new Date(input.now)]);
      if (updated.rowCount !== 1) throw new FiscalWorkError("Failed to lock fiscal checkout snapshot", true);
    }, { isolation: "serializable" });
  }

  async workspace(limit = 250): Promise<readonly FiscalDocumentProjection[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1000) throw new FiscalWorkError("Invalid fiscal workspace limit");
    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT td.public_id,o.public_id AS order_public_id,td.type,td.status,td.transmission_status,
               td.gross_minor,td.currency,td.mapping_version,td.invoice_type_code,td.document_number,
               td.aade_mark,td.aade_uid,td.aade_qr_url,td.last_error,td.created_at
          FROM tax_documents td
          LEFT JOIN customer_orders o ON o.id=td.order_id
         ORDER BY td.created_at DESC,td.id DESC
         LIMIT $1
      `, [limit]);
      return result.rows.map(projectDocument);
    }, { readOnly: true });
  }

  async recordTimologioIssuance(input: {
    documentId: string;
    documentNumber: string;
    aadeMark: string;
    aadeUid?: string;
    qrUrl?: string;
    issueDate: string;
    actorUserId: string;
    now: number;
  }): Promise<FiscalDocumentProjection> {
    const documentId = bounded(input.documentId, 128, "Fiscal document ID");
    const documentNumber = bounded(input.documentNumber, 120, "Official document number");
    const aadeMark = bounded(input.aadeMark, 40, "AADE MARK");
    const aadeUid = optionalBounded(input.aadeUid, 160, "AADE UID");
    const qrUrl = optionalBounded(input.qrUrl, 2000, "AADE QR URL");
    const actorUserId = bounded(input.actorUserId, 128, "Admin actor");
    if (!/^\d{1,40}$/.test(aadeMark)) throw new FiscalWorkError("AADE MARK must be numeric");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate) || !validIsoDate(input.issueDate)) throw new FiscalWorkError("Issue date must be a valid YYYY-MM-DD date");
    if (qrUrl && !/^https:\/\//i.test(qrUrl)) throw new FiscalWorkError("AADE QR URL must use HTTPS");

    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const current = await tx.query<SqlRow>(`
        SELECT td.id::text AS document_uuid,td.public_id,td.type,td.status,td.transmission_status,
               td.document_number,td.aade_mark,td.aade_uid,td.aade_qr_url,td.payload_snapshot
          FROM tax_documents td
         WHERE td.public_id=$1 OR td.id::text=$1
         FOR UPDATE OF td
      `, [documentId]);
      if (current.rowCount !== 1) throw new FiscalWorkError("Fiscal document not found");
      const row = current.rows[0];
      const type = text(row.type, "tax_document.type");
      if (type !== "retail_receipt" && type !== "customer_invoice") throw new FiscalWorkError("Only customer receipts and customer invoices can be reconciled through this timologio action");
      if (["cancelled", "rejected"].includes(text(row.transmission_status, "tax_document.transmission_status"))) throw new FiscalWorkError("Cancelled/rejected fiscal documents cannot be marked as issued");
      const existingMark = optionalText(row.aade_mark);
      const existingNumber = optionalText(row.document_number);
      if (existingMark && existingMark !== aadeMark) throw new FiscalWorkError("This fiscal document already has a different AADE MARK");
      if (existingNumber && existingNumber !== documentNumber) throw new FiscalWorkError("This fiscal document already has a different official document number");

      const reconciliation = {
        source: "timologio_manual_reconciliation",
        recordedAt: new Date(input.now).toISOString(),
        recordedBy: actorUserId,
        documentNumber,
        aadeMark,
        aadeUid: aadeUid ?? null,
        qrUrl: qrUrl ?? null,
        issueDate: input.issueDate
      };
      const updated = await tx.query<SqlRow>(`
        UPDATE tax_documents
           SET provider='aade_timologio',
               document_number=$2,
               aade_mark=$3,
               aade_uid=COALESCE($4,aade_uid),
               aade_qr_url=COALESCE($5,aade_qr_url),
               issue_date=$6::date,
               status='issued',
               transmission_status='accepted',
               issued_at=COALESCE(issued_at,$7),
               last_transmission_at=$7,
               last_error=NULL,
               payload_snapshot=jsonb_set(COALESCE(payload_snapshot,'{}'::jsonb),'{timologioReconciliation}',$8::jsonb,true)
         WHERE id=$1
         RETURNING public_id,type,status,transmission_status,gross_minor,currency,mapping_version,invoice_type_code,
                   document_number,aade_mark,aade_uid,aade_qr_url,last_error,created_at,
                   (SELECT public_id FROM customer_orders o WHERE o.id=tax_documents.order_id) AS order_public_id
      `, [text(row.document_uuid, "tax_document.id"), documentNumber, aadeMark, aadeUid ?? null, qrUrl ?? null, input.issueDate, new Date(input.now), JSON.stringify(reconciliation)]);
      if (updated.rowCount !== 1) throw new FiscalWorkError("Failed to record timologio reconciliation", true);
      return projectDocument(updated.rows[0]);
    }, { isolation: "serializable" });
  }

  async materializePaidOrder(input: {
    orderId: string;
    paymentId: string;
    eventCapturedMinor?: number;
    eventCurrency?: string;
    now: number;
  }): Promise<FiscalMaterializationResult> {
    if (!input.orderId.trim() || !input.paymentId.trim()) throw new FiscalWorkError("Fiscal paid-order event is missing order/payment identity");
    if (input.eventCapturedMinor !== undefined && (!Number.isSafeInteger(input.eventCapturedMinor) || input.eventCapturedMinor < 0)) throw new FiscalWorkError("Fiscal paid-order event has an invalid captured amount");

    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const headerResult = await tx.query<SqlRow>(`
        SELECT o.id::text AS order_uuid,o.public_id AS order_public_id,o.order_number,o.market_id::text AS market_uuid,
               o.currency,o.subtotal_minor,o.shipping_minor,o.discount_minor,o.tax_minor,o.total_minor,
               o.billing_address_snapshot,o.created_at,
               p.id::text AS payment_uuid,p.public_id AS payment_public_id,p.status::text AS payment_status,
               p.captured_minor,p.currency AS payment_currency
          FROM customer_orders o
          JOIN payments p ON p.order_id=o.id
         WHERE (o.public_id=$1 OR o.id::text=$1)
           AND (p.public_id=$2 OR p.id::text=$2)
         FOR UPDATE OF o,p
      `, [input.orderId, input.paymentId]);
      if (headerResult.rowCount !== 1) throw new FiscalWorkError("Paid-order fiscal source record was not found; manual reconciliation is required");
      const header = headerResult.rows[0];

      const paymentStatus = text(header.payment_status, "payment_status");
      if (!["captured", "partially_refunded", "refunded", "chargeback"].includes(paymentStatus)) {
        throw new FiscalWorkError(`Paid-order fiscal event points to payment status ${paymentStatus}; manual reconciliation is required`);
      }
      const totalMinor = integer(header.total_minor, "total_minor");
      const capturedMinor = integer(header.captured_minor, "captured_minor");
      if (capturedMinor !== totalMinor) throw new FiscalWorkError("Captured payment amount does not match the order total; fiscal issuance is blocked for manual reconciliation");
      if (input.eventCapturedMinor !== undefined && input.eventCapturedMinor !== capturedMinor) throw new FiscalWorkError("Fiscal event capture snapshot differs from the payment record; manual reconciliation is required");
      const currency = text(header.currency, "order_currency");
      const paymentCurrency = text(header.payment_currency, "payment_currency");
      if (currency !== paymentCurrency || (input.eventCurrency && input.eventCurrency !== currency)) throw new FiscalWorkError("Fiscal event/order/payment currency mismatch; manual reconciliation is required");

      const billing = object(header.billing_address_snapshot);
      const fiscal = object(billing.fiscal);
      const choice = typeof fiscal.documentType === "string" ? fiscal.documentType : "";
      const documentType: FiscalCustomerDocumentType = choice === "receipt"
        ? "retail_receipt"
        : choice === "invoice"
          ? "customer_invoice"
          : (() => { throw new FiscalWorkError("Order has no immutable receipt/invoice choice; historical order requires manual fiscal review"); })();
      if (documentType === "customer_invoice") validateInvoiceSnapshot(fiscal);

      const orderUuid = text(header.order_uuid, "order_uuid");
      const existing = await tx.query<SqlRow>(`
        SELECT public_id,type,status
          FROM tax_documents
         WHERE order_id=$1 AND type IN ('retail_receipt','customer_invoice')
         ORDER BY created_at,id
         FOR UPDATE
      `, [orderUuid]);
      if (existing.rowCount > 1) throw new FiscalWorkError("Multiple customer fiscal documents already exist for the same order; manual reconciliation is required");
      if (existing.rowCount === 1) {
        const existingType = text(existing.rows[0].type, "tax_document.type") as FiscalCustomerDocumentType;
        if (existingType !== documentType) throw new FiscalWorkError("Existing fiscal document type conflicts with the immutable checkout choice");
        return { documentId: text(existing.rows[0].public_id, "tax_document.public_id"), documentType, created: false };
      }

      const linesResult = await tx.query<SqlRow>(`
        SELECT ol.public_id AS line_id,cv.public_id AS canonical_variant_id,ol.quantity,ol.product_snapshot,
               ol.retail_unit_price_minor,ol.tax_rate_bps,ol.tax_minor
          FROM order_lines ol
          JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
         WHERE ol.order_id=$1
         ORDER BY ol.created_at,ol.id
      `, [orderUuid]);
      if (linesResult.rowCount === 0) throw new FiscalWorkError("Paid order has no order lines; fiscal document cannot be prepared");

      const lines = linesResult.rows.map((row) => {
        const quantity = integer(row.quantity, "line.quantity");
        const unitGrossMinor = integer(row.retail_unit_price_minor, "line.retail_unit_price_minor");
        const taxMinor = integer(row.tax_minor, "line.tax_minor");
        const lineGrossMinor = unitGrossMinor * quantity;
        if (!Number.isSafeInteger(lineGrossMinor)) throw new FiscalWorkError("Order line gross amount exceeds safe integer range");
        return {
          lineId: text(row.line_id, "line.public_id"),
          canonicalVariantId: text(row.canonical_variant_id, "line.canonical_variant_id"),
          quantity,
          unitGrossMinor,
          lineGrossMinor,
          taxRateBps: integer(row.tax_rate_bps, "line.tax_rate_bps"),
          taxMinor,
          product: object(row.product_snapshot)
        };
      });

      const taxMinor = integer(header.tax_minor, "tax_minor");
      const netMinor = totalMinor - taxMinor;
      if (netMinor < 0) throw new FiscalWorkError("Order tax exceeds the captured gross amount; fiscal issuance is blocked");
      const payload = {
        schemaVersion: "fiscal-work-v1",
        issuanceChannel: "timologio",
        mappingStatus: "accountant_mapping_required",
        source: {
          eventType: "fiscal.order_paid",
          paymentId: text(header.payment_public_id, "payment_public_id"),
          paymentStatus
        },
        order: {
          id: text(header.order_public_id, "order_public_id"),
          number: text(header.order_number, "order_number"),
          createdAt: iso(header.created_at),
          currency
        },
        fiscal,
        totals: {
          subtotalMinor: integer(header.subtotal_minor, "subtotal_minor"),
          shippingMinor: integer(header.shipping_minor, "shipping_minor"),
          discountMinor: integer(header.discount_minor, "discount_minor"),
          netMinor,
          taxMinor,
          grossMinor: totalMinor,
          lineTaxMinor: lines.reduce((sum, line) => sum + line.taxMinor, 0)
        },
        lines
      };

      const inserted = await tx.query<SqlRow>(`
        INSERT INTO tax_documents(
          market_id,order_id,type,provider,currency,net_minor,tax_minor,gross_minor,status,payload_snapshot,
          transmission_status,created_at
        )
        VALUES($1,$2,$3,NULL,$4,$5,$6,$7,'pending',$8::jsonb,'not_ready',$9)
        RETURNING public_id
      `, [text(header.market_uuid, "market_uuid"), orderUuid, documentType, currency, netMinor, taxMinor, totalMinor, JSON.stringify(payload), new Date(input.now)]);
      if (inserted.rowCount !== 1) throw new FiscalWorkError("Failed to create fiscal work item", true);
      return { documentId: text(inserted.rows[0].public_id, "tax_document.public_id"), documentType, created: true };
    }, { isolation: "serializable" });
  }
}

function projectDocument(row: SqlRow): FiscalDocumentProjection {
  return {
    id: text(row.public_id, "tax_document.public_id"),
    orderId: optionalText(row.order_public_id),
    type: text(row.type, "tax_document.type"),
    status: text(row.status, "tax_document.status"),
    transmissionStatus: text(row.transmission_status, "tax_document.transmission_status"),
    grossMinor: integer(row.gross_minor, "tax_document.gross_minor"),
    currency: text(row.currency, "tax_document.currency"),
    mappingVersion: optionalText(row.mapping_version),
    invoiceTypeCode: optionalText(row.invoice_type_code),
    documentNumber: optionalText(row.document_number),
    aadeMark: optionalText(row.aade_mark),
    aadeUid: optionalText(row.aade_uid),
    qrUrl: optionalText(row.aade_qr_url),
    lastError: optionalText(row.last_error),
    createdAt: epoch(row.created_at)
  };
}

function validateInvoiceSnapshot(fiscal: Record<string, unknown>): void {
  const business = object(fiscal.business);
  const address = object(business.address);
  const legalName = optionalText(business.legalName);
  const vatNumber = optionalText(business.vatNumber);
  const email = optionalText(business.email);
  const line1 = optionalText(address.line1);
  const locality = optionalText(address.locality);
  const postcode = optionalText(address.postcode);
  if (!legalName || !vatNumber || !email || !line1 || !locality || !postcode) throw new FiscalWorkError("Invoice fiscal snapshot is incomplete; manual reconciliation is required");
  if (!validGreekVat(vatNumber)) throw new FiscalWorkError("Invoice fiscal snapshot contains an invalid Greek VAT number");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FiscalWorkError("Invoice fiscal snapshot contains an invalid billing email");
  if (!/^\d{5}$/.test(postcode) || address.countryCode !== "GR") throw new FiscalWorkError("Invoice fiscal snapshot contains an invalid Greek billing address");
}

function validGreekVat(value: string): boolean {
  if (!/^\d{9}$/.test(value) || /^0{9}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 8).reduce((total, digit, index) => total + digit * 2 ** (8 - index), 0);
  return (sum % 11) % 10 === digits[8];
}

function validIsoDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function sameFiscalIdentity(existing: unknown, next: Readonly<Record<string, unknown>>): boolean {
  const current = object(existing);
  if (current.documentType !== next.documentType || current.source !== next.source) return false;
  if (next.documentType === "receipt") return true;
  const currentBusiness = object(current.business);
  const nextBusiness = object(next.business);
  return optionalText(currentBusiness.legalName) === optionalText(nextBusiness.legalName)
    && optionalText(currentBusiness.vatNumber) === optionalText(nextBusiness.vatNumber)
    && optionalText(currentBusiness.email) === optionalText(nextBusiness.email)
    && JSON.stringify(object(currentBusiness.address)) === JSON.stringify(object(nextBusiness.address));
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Invalid JSON is converted to an empty object and rejected by the caller where required.
    }
  }
  return {};
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new FiscalWorkError(`Invalid ${label} in fiscal source data`);
  return value;
}
function bounded(value: unknown, max: number, label: string): string {
  const parsed = optionalText(value);
  if (!parsed || parsed.length > max) throw new FiscalWorkError(`${label} is required and must be at most ${max} characters`);
  return parsed;
}
function optionalBounded(value: unknown, max: number, label: string): string | undefined {
  const parsed = optionalText(value);
  if (!parsed) return undefined;
  if (parsed.length > max) throw new FiscalWorkError(`${label} must be at most ${max} characters`);
  return parsed;
}
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new FiscalWorkError(`Invalid ${label} in fiscal source data`);
  return parsed;
}
function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new FiscalWorkError("Invalid fiscal document timestamp");
  return parsed;
}
function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new FiscalWorkError("Invalid order timestamp in fiscal source data");
  return date.toISOString();
}

import type { SessionPrincipal } from "@buy-local-sparta/core";
import { hasAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminVendorFiscalDocument = Readonly<{
  vendorId: string;
  id: string;
  orderId: string;
  orderNumber: string;
  type: string;
  documentNumber?: string;
  status: string;
  transmissionStatus: string;
  grossMinor: number;
  netMinor: number;
  taxMinor: number;
  currency: string;
  mappingVersion?: string;
  invoiceTypeCode?: string;
  aadeMark?: string;
  aadeUid?: string;
  qrUrl?: string;
  lastError?: string;
  customerEmailStatus: string;
  customerEmailedAt?: string;
  customerEmailError?: string;
  issuedAt?: string;
  createdAt: string;
}>;

export type AdminVendorFiscalWorkspace = Readonly<{
  permitted: boolean;
  documentsByVendor: Readonly<Record<string, readonly AdminVendorFiscalDocument[]>>;
}>;

export async function adminVendorFiscalWorkspace(principal: SessionPrincipal): Promise<AdminVendorFiscalWorkspace> {
  if (!hasAdminPermission(principal, "finance.read")) return { permitted: false, documentsByVendor: {} };
  if (!productionDatabaseConfigured()) return { permitted: true, documentsByVendor: {} };

  const rows = await getProductionPostgresRuntime().nativePool.query<{
    vendor_public_id: string;
    tax_document_public_id: string;
    order_public_id: string;
    order_number: string;
    type: string;
    document_number: string | null;
    status: string;
    transmission_status: string;
    gross_minor: string | number;
    net_minor: string | number;
    tax_minor: string | number;
    currency: string;
    mapping_version: string | null;
    invoice_type_code: string | null;
    aade_mark: string | null;
    aade_uid: string | null;
    aade_qr_url: string | null;
    last_error: string | null;
    customer_email_status: string;
    customer_emailed_at: Date | null;
    customer_email_error: string | null;
    issued_at: Date | null;
    created_at: Date;
  }>(`
    SELECT DISTINCT
      v.public_id AS vendor_public_id,
      td.public_id AS tax_document_public_id,
      o.public_id AS order_public_id,
      o.order_number,
      td.type,
      td.document_number,
      td.status,
      td.transmission_status,
      td.gross_minor,
      td.net_minor,
      td.tax_minor,
      td.currency,
      td.mapping_version,
      td.invoice_type_code,
      td.aade_mark,
      td.aade_uid,
      td.aade_qr_url,
      td.last_error,
      td.customer_email_status,
      td.customer_emailed_at,
      td.customer_email_error,
      td.issued_at,
      td.created_at
    FROM tax_documents td
    JOIN customer_orders o ON o.id = td.order_id
    JOIN order_lines ol ON ol.order_id = o.id
    JOIN vendor_businesses v ON v.id = ol.vendor_id
    JOIN markets m ON m.id = td.market_id
    WHERE m.code = 'sparta'
    ORDER BY v.public_id, td.created_at DESC, td.public_id
  `);

  const grouped: Record<string, AdminVendorFiscalDocument[]> = {};
  for (const row of rows.rows) {
    const document: AdminVendorFiscalDocument = {
      vendorId: row.vendor_public_id,
      id: row.tax_document_public_id,
      orderId: row.order_public_id,
      orderNumber: row.order_number,
      type: row.type,
      documentNumber: optional(row.document_number),
      status: row.status,
      transmissionStatus: row.transmission_status,
      grossMinor: integer(row.gross_minor),
      netMinor: integer(row.net_minor),
      taxMinor: integer(row.tax_minor),
      currency: row.currency.trim(),
      mappingVersion: optional(row.mapping_version),
      invoiceTypeCode: optional(row.invoice_type_code),
      aadeMark: optional(row.aade_mark),
      aadeUid: optional(row.aade_uid),
      qrUrl: optional(row.aade_qr_url),
      lastError: optional(row.last_error),
      customerEmailStatus: row.customer_email_status,
      customerEmailedAt: iso(row.customer_emailed_at),
      customerEmailError: optional(row.customer_email_error),
      issuedAt: iso(row.issued_at),
      createdAt: row.created_at.toISOString()
    };
    (grouped[document.vendorId] ??= []).push(document);
  }

  return { permitted: true, documentsByVendor: grouped };
}

function integer(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Expected integer minor-unit value");
  return parsed;
}

function optional(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function iso(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

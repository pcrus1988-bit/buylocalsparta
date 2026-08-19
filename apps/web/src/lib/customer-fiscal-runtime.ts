import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerFiscalDocument = Readonly<{
  id: string;
  orderId: string;
  type: "retail_receipt" | "customer_invoice";
  documentNumber: string;
  mark: string;
  uid?: string;
  qrUrl?: string;
  issuedAt: number;
  currency: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  payload: Record<string, unknown>;
}>;

const PRIMARY_CUSTOMER_TYPES = ["pending_customer_sale", "retail_receipt", "customer_invoice"] as const;

export async function capturePaidOrderForFiscalIssuance(orderId: string, now = Date.now()): Promise<{ captured: boolean; documentId?: string }> {
  if (!productionDatabaseConfigured()) return { captured: false };
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query<{
      order_uuid: string; order_public_id: string; order_number: string; market_id: string; user_id: string | null;
      email: string | null; currency: string; subtotal_minor: string | number; shipping_minor: string | number;
      discount_minor: string | number; tax_minor: string | number; total_minor: string | number;
      billing_address_snapshot: Record<string, unknown>; confirmed_at: Date | null; payment_id: string;
      provider: string; provider_transaction_id: string | null; provider_order_code: string | null; captured_minor: string | number;
    }>(`SELECT o.id::text AS order_uuid,o.public_id AS order_public_id,o.order_number,o.market_id::text,o.user_id::text,
              u.email,o.currency,o.subtotal_minor,o.shipping_minor,o.discount_minor,o.tax_minor,o.total_minor,
              o.billing_address_snapshot,o.confirmed_at,p.public_id AS payment_id,p.provider,p.provider_transaction_id,p.provider_order_code,p.captured_minor
         FROM customer_orders o
         JOIN payments p ON p.order_id=o.id
         LEFT JOIN users u ON u.id=o.user_id
        WHERE o.public_id=$1 AND o.status='confirmed' AND p.status IN ('captured','partially_refunded','refunded')
          AND p.captured_minor >= o.total_minor
        FOR UPDATE OF o,p`, [orderId]);
    if (!order.rowCount) {
      await client.query("ROLLBACK");
      return { captured: false };
    }
    const row = order.rows[0]!;
    const lines = await client.query(`SELECT ol.public_id,ol.quantity,ol.retail_unit_price_minor,ol.tax_rate_bps,ol.tax_minor,
              ol.discount_allocation_minor,ol.product_snapshot
         FROM order_lines ol WHERE ol.order_id=$1::uuid ORDER BY ol.created_at,ol.id`, [row.order_uuid]);
    const totalMinor = integer(row.total_minor);
    const taxMinor = integer(row.tax_minor);
    if (taxMinor < 0 || taxMinor > totalMinor) throw new Error("Invalid captured order tax totals");
    const payload = {
      lifecycle: "pending_accounting_mapping",
      capturedFrom: "verified_payment",
      capturedAt: new Date(now).toISOString(),
      order: {
        id: row.order_public_id,
        number: row.order_number,
        currency: row.currency,
        subtotalMinor: integer(row.subtotal_minor),
        shippingMinor: integer(row.shipping_minor),
        discountMinor: integer(row.discount_minor),
        taxMinor,
        totalMinor,
        confirmedAt: row.confirmed_at?.toISOString(),
        billingAddress: row.billing_address_snapshot ?? {}
      },
      customer: { userId: row.user_id, email: row.email },
      payment: {
        id: row.payment_id,
        provider: row.provider,
        transactionId: row.provider_transaction_id,
        orderCode: row.provider_order_code,
        capturedMinor: integer(row.captured_minor)
      },
      lines: lines.rows
    };
    const inserted = await client.query<{ public_id: string }>(`INSERT INTO tax_documents(
          market_id,order_id,type,document_number,provider,currency,net_minor,tax_minor,gross_minor,status,payload_snapshot,transmission_status,created_at)
        VALUES($1::uuid,$2::uuid,'pending_customer_sale',NULL,'aade_mydata',$3,$4,$5,$6,'pending',$7::jsonb,'not_ready',$8)
        ON CONFLICT (order_id) WHERE order_id IS NOT NULL AND type IN ('pending_customer_sale','retail_receipt','customer_invoice')
        DO NOTHING RETURNING public_id`, [row.market_id,row.order_uuid,row.currency,totalMinor-taxMinor,taxMinor,totalMinor,JSON.stringify(payload),new Date(now)]);
    const existing = inserted.rowCount ? inserted.rows[0]!.public_id : (await client.query<{ public_id: string }>(
      `SELECT public_id FROM tax_documents WHERE order_id=$1::uuid AND type = ANY($2::text[]) ORDER BY created_at LIMIT 1`,
      [row.order_uuid, [...PRIMARY_CUSTOMER_TYPES]]
    )).rows[0]?.public_id;
    await client.query("COMMIT");
    return { captured: true, documentId: existing };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function customerFiscalDocumentForOrder(orderId: string): Promise<CustomerFiscalDocument | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().nativePool.query<{
    public_id: string; order_public_id: string; type: string; document_number: string | null; aade_mark: string | null;
    aade_uid: string | null; aade_qr_url: string | null; issued_at: Date | null; currency: string;
    net_minor: string | number; tax_minor: string | number; gross_minor: string | number; payload_snapshot: Record<string, unknown>;
  }>(`SELECT td.public_id,o.public_id AS order_public_id,td.type,td.document_number,td.aade_mark,td.aade_uid,td.aade_qr_url,
            td.issued_at,td.currency,td.net_minor,td.tax_minor,td.gross_minor,td.payload_snapshot
       FROM tax_documents td JOIN customer_orders o ON o.id=td.order_id
      WHERE o.public_id=$1 AND td.type IN ('retail_receipt','customer_invoice')
        AND td.transmission_status='accepted' AND td.aade_mark IS NOT NULL
      ORDER BY td.issued_at DESC NULLS LAST,td.created_at DESC LIMIT 1`, [orderId]);
  if (!result.rowCount) return undefined;
  const row = result.rows[0]!;
  if (!row.document_number || !row.aade_mark || !row.issued_at) return undefined;
  return {
    id: row.public_id,
    orderId: row.order_public_id,
    type: row.type as CustomerFiscalDocument["type"],
    documentNumber: row.document_number,
    mark: row.aade_mark,
    uid: row.aade_uid ?? undefined,
    qrUrl: row.aade_qr_url ?? undefined,
    issuedAt: row.issued_at.getTime(),
    currency: row.currency.trim(),
    netMinor: integer(row.net_minor), taxMinor: integer(row.tax_minor), grossMinor: integer(row.gross_minor),
    payload: row.payload_snapshot ?? {}
  };
}

function integer(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Expected integer minor-unit value");
  return parsed;
}

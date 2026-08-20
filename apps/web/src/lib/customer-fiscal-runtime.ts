import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerFiscalLine = Readonly<{
  id: string;
  title: string;
  description?: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number;
  taxMinor: number;
  lineTotalMinor: number;
  itemCode?: string;
  sku?: string;
  gtin?: string;
  mpn?: string;
  model?: string;
}>;

export type CustomerFiscalVendorGroup = Readonly<{
  vendorId?: string;
  tradingName: string;
  legalName: string;
  taxNumber?: string;
  gemiNumber?: string;
  lines: readonly CustomerFiscalLine[];
}>;

export type CustomerFiscalPayment = Readonly<{
  provider: string;
  method?: string;
  transactionId?: string;
  providerOrderCode?: string;
  tid?: string;
  mydataPaymentType?: number;
}>;

export type CustomerFiscalDocument = Readonly<{
  id: string;
  orderId: string;
  orderNumber: string;
  orderPlacedAt: number;
  orderConfirmedAt?: number;
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
  subtotalMinor: number;
  shippingMinor: number;
  discountMinor: number;
  payment: CustomerFiscalPayment;
  billingAddress: Record<string, unknown>;
  vendorGroups: readonly CustomerFiscalVendorGroup[];
  payload: Record<string, unknown>;
}>;

const PRIMARY_CUSTOMER_TYPES = ["pending_customer_sale", "retail_receipt", "customer_invoice"] as const;
const PAID_FISCAL_ELIGIBLE_ORDER_STATUSES = ["confirmed", "partially_fulfilled", "fulfilled", "completed"] as const;

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
      billing_address_snapshot: Record<string, unknown>; created_at: Date; confirmed_at: Date | null; payment_id: string;
      provider: string; provider_transaction_id: string | null; provider_order_code: string | null; captured_minor: string | number;
    }>(`SELECT o.id::text AS order_uuid,o.public_id AS order_public_id,o.order_number,o.market_id::text,o.user_id::text,
              u.email,o.currency,o.subtotal_minor,o.shipping_minor,o.discount_minor,o.tax_minor,o.total_minor,
              o.billing_address_snapshot,o.created_at,o.confirmed_at,p.public_id AS payment_id,p.provider,p.provider_transaction_id,p.provider_order_code,p.captured_minor
         FROM customer_orders o
         JOIN payments p ON p.order_id=o.id
         LEFT JOIN users u ON u.id=o.user_id
        WHERE o.public_id=$1 AND o.status = ANY($2::order_status[]) AND p.status IN ('captured','partially_refunded','refunded')
          AND p.captured_minor >= o.total_minor
        FOR UPDATE OF o,p`, [orderId, [...PAID_FISCAL_ELIGIBLE_ORDER_STATUSES]]);
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
        placedAt: row.created_at.toISOString(),
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
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<{
    public_id: string; order_uuid: string; order_public_id: string; order_number: string; order_created_at: Date; order_confirmed_at: Date | null;
    type: string; document_number: string | null; aade_mark: string | null; aade_uid: string | null; aade_qr_url: string | null;
    issued_at: Date | null; currency: string; net_minor: string | number; tax_minor: string | number; gross_minor: string | number;
    subtotal_minor: string | number; shipping_minor: string | number; discount_minor: string | number; billing_address_snapshot: Record<string, unknown>;
    payment_processor: string | null; payment_processor_method: string | null; payment_transaction_id: string | null; payment_tid: string | null;
    mydata_payment_type: string | number | null; payment_provider: string | null; provider_order_code: string | null; provider_transaction_id: string | null;
    payload_snapshot: Record<string, unknown>;
  }>(`SELECT td.public_id,o.id::text AS order_uuid,o.public_id AS order_public_id,o.order_number,o.created_at AS order_created_at,
            o.confirmed_at AS order_confirmed_at,td.type,td.document_number,td.aade_mark,td.aade_uid,td.aade_qr_url,td.issued_at,
            td.currency,td.net_minor,td.tax_minor,td.gross_minor,o.subtotal_minor,o.shipping_minor,o.discount_minor,o.billing_address_snapshot,
            td.payment_processor,td.payment_processor_method,td.payment_transaction_id,td.payment_tid,td.mydata_payment_type,
            p.provider AS payment_provider,p.provider_order_code,p.provider_transaction_id,td.payload_snapshot
       FROM tax_documents td
       JOIN customer_orders o ON o.id=td.order_id
       LEFT JOIN LATERAL (
         SELECT p.provider,p.provider_order_code,p.provider_transaction_id
           FROM payments p WHERE p.order_id=o.id
          ORDER BY p.updated_at DESC,p.created_at DESC,p.id DESC LIMIT 1
       ) p ON true
      WHERE o.public_id=$1 AND td.type IN ('retail_receipt','customer_invoice')
        AND td.transmission_status='accepted' AND td.aade_mark IS NOT NULL
      ORDER BY td.issued_at DESC NULLS LAST,td.created_at DESC LIMIT 1`, [orderId]);
  if (!result.rowCount) return undefined;
  const row = result.rows[0]!;
  if (!row.document_number || !row.aade_mark || !row.issued_at) return undefined;

  const lineRows = await db.query<{
    public_id: string; quantity: string | number; retail_unit_price_minor: string | number; discount_allocation_minor: string | number;
    tax_rate_bps: string | number; tax_minor: string | number; product_snapshot: Record<string, unknown>;
    canonical_variant_public_id: string | null; title: string | null; description: string | null; vendor_sku: string | null;
    gtin: string | null; mpn: string | null; model: string | null; vendor_public_id: string | null; legal_name: string | null;
    trading_name: string | null; tax_number: string | null; gemi_number: string | null;
  }>(`SELECT ol.public_id,ol.quantity,ol.retail_unit_price_minor,ol.discount_allocation_minor,ol.tax_rate_bps,ol.tax_minor,ol.product_snapshot,
            cv.public_id AS canonical_variant_public_id,
            COALESCE(pt_el.title,pt_en.title,ol.product_snapshot->>'title') AS title,
            COALESCE(pt_el.description,pt_en.description,ol.product_snapshot->>'description') AS description,
            vo.vendor_sku,COALESCE(vo.source_gtin,cv.gtin) AS gtin,cv.mpn,cv.model,
            vb.public_id AS vendor_public_id,vb.legal_name,vb.trading_name,vb.tax_number,vb.gemi_number
       FROM order_lines ol
       LEFT JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
       LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
       LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
       LEFT JOIN vendor_offers vo ON vo.id=ol.assigned_offer_id
       LEFT JOIN vendor_businesses vb ON vb.id=COALESCE(ol.vendor_id,vo.vendor_id)
      WHERE ol.order_id=$1::uuid
      ORDER BY COALESCE(vb.trading_name,vb.legal_name,''),ol.created_at,ol.id`, [row.order_uuid]);

  const grouped = new Map<string, { vendorId?: string; tradingName: string; legalName: string; taxNumber?: string; gemiNumber?: string; lines: CustomerFiscalLine[] }>();
  for (const lineRow of lineRows.rows) {
    const snapshot = record(lineRow.product_snapshot);
    const vendorKey = lineRow.vendor_public_id ?? `unassigned:${optionalText(lineRow.trading_name) ?? optionalText(lineRow.legal_name) ?? "local"}`;
    const tradingName = optionalText(lineRow.trading_name) ?? optionalText(lineRow.legal_name) ?? "Τοπικό συνεργαζόμενο κατάστημα";
    const legalName = optionalText(lineRow.legal_name) ?? tradingName;
    let group = grouped.get(vendorKey);
    if (!group) {
      group = {
        ...(lineRow.vendor_public_id ? { vendorId: lineRow.vendor_public_id } : {}),
        tradingName,
        legalName,
        ...(optionalText(lineRow.tax_number) ? { taxNumber: lineRow.tax_number!.trim() } : {}),
        ...(optionalText(lineRow.gemi_number) ? { gemiNumber: lineRow.gemi_number!.trim() } : {}),
        lines: []
      };
      grouped.set(vendorKey, group);
    }
    const quantity = positiveInteger(lineRow.quantity, "order line quantity");
    const unitPriceMinor = integer(lineRow.retail_unit_price_minor);
    const discountMinor = Math.max(0, integer(lineRow.discount_allocation_minor));
    const lineTotalMinor = Math.max(0, unitPriceMinor * quantity - discountMinor);
    const title = optionalText(lineRow.title) ?? optionalText(snapshot.title) ?? "Προϊόν";
    const sku = optionalText(lineRow.vendor_sku) ?? optionalText(snapshot.sku) ?? optionalText(snapshot.vendorSku);
    const gtin = optionalText(lineRow.gtin) ?? optionalText(snapshot.gtin) ?? optionalText(snapshot.ean);
    group.lines.push({
      id: lineRow.public_id,
      title,
      ...(optionalText(lineRow.description) ?? optionalText(snapshot.description) ? { description: optionalText(lineRow.description) ?? optionalText(snapshot.description) } : {}),
      quantity,
      unitPriceMinor,
      discountMinor,
      taxRateBps: integer(lineRow.tax_rate_bps),
      taxMinor: integer(lineRow.tax_minor),
      lineTotalMinor,
      ...(sku ? { sku } : {}),
      ...(gtin ? { gtin } : {}),
      ...(optionalText(lineRow.mpn) ? { mpn: lineRow.mpn!.trim() } : {}),
      ...(optionalText(lineRow.model) ? { model: lineRow.model!.trim() } : {}),
      ...(optionalText(lineRow.canonical_variant_public_id) ? { itemCode: lineRow.canonical_variant_public_id!.trim() } : {})
    });
  }

  const provider = optionalText(row.payment_processor) ?? optionalText(row.payment_provider) ?? "—";
  const transactionId = optionalText(row.payment_transaction_id) ?? optionalText(row.provider_transaction_id);
  const mydataPaymentType = row.mydata_payment_type == null ? undefined : integer(row.mydata_payment_type);
  return {
    id: row.public_id,
    orderId: row.order_public_id,
    orderNumber: row.order_number,
    orderPlacedAt: row.order_created_at.getTime(),
    ...(row.order_confirmed_at ? { orderConfirmedAt: row.order_confirmed_at.getTime() } : {}),
    type: row.type as CustomerFiscalDocument["type"],
    documentNumber: row.document_number,
    mark: row.aade_mark,
    uid: row.aade_uid ?? undefined,
    qrUrl: row.aade_qr_url ?? undefined,
    issuedAt: row.issued_at.getTime(),
    currency: row.currency.trim(),
    netMinor: integer(row.net_minor),
    taxMinor: integer(row.tax_minor),
    grossMinor: integer(row.gross_minor),
    subtotalMinor: integer(row.subtotal_minor),
    shippingMinor: integer(row.shipping_minor),
    discountMinor: integer(row.discount_minor),
    payment: {
      provider,
      ...(optionalText(row.payment_processor_method) ? { method: row.payment_processor_method!.trim() } : {}),
      ...(transactionId ? { transactionId } : {}),
      ...(optionalText(row.provider_order_code) ? { providerOrderCode: row.provider_order_code!.trim() } : {}),
      ...(optionalText(row.payment_tid) ? { tid: row.payment_tid!.trim() } : {}),
      ...(mydataPaymentType !== undefined ? { mydataPaymentType } : {})
    },
    billingAddress: record(row.billing_address_snapshot),
    vendorGroups: [...grouped.values()].map(group => Object.freeze({ ...group, lines: Object.freeze([...group.lines]) })),
    payload: row.payload_snapshot ?? {}
  };
}

function integer(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Expected integer minor-unit value");
  return parsed;
}

function positiveInteger(value: string | number, label: string): number {
  const parsed = integer(value);
  if (parsed <= 0) throw new Error(`Expected positive integer for ${label}`);
  return parsed;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

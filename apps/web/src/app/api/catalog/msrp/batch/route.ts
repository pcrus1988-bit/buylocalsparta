import { NextRequest, NextResponse } from "next/server";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 40;

type BatchRequestItem = Readonly<{
  productId: string;
  vendorId: string;
  retailPriceMinor: number;
}>;

type BatchRow = Readonly<{
  product_id: string;
  vendor_id: string;
  retail_price_minor: number | string;
  msrp_minor: number | string;
}>;

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= 160 ? value.trim() : undefined;
}

function moneyMinor(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseItems(value: unknown): readonly BatchRequestItem[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BATCH_SIZE) return undefined;
  const unique = new Map<string, BatchRequestItem>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const record = raw as Record<string, unknown>;
    const productId = textValue(record.productId);
    const vendorId = textValue(record.vendorId);
    const retailPriceMinor = moneyMinor(record.retailPriceMinor);
    if (!productId || !vendorId || retailPriceMinor === undefined) return undefined;
    const item = { productId, vendorId, retailPriceMinor };
    unique.set(`${productId}\u0000${vendorId}\u0000${retailPriceMinor}`, item);
  }
  return [...unique.values()];
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const items = parseItems(body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).items : undefined);
  if (!items) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  if (!productionDatabaseConfigured()) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });

  const requested = items.map((item) => ({
    product_id: item.productId,
    vendor_id: item.vendorId,
    retail_price_minor: item.retailPriceMinor
  }));

  const result = await getProductionPostgresRuntime().nativePool.query<BatchRow>(`
    WITH requested AS (
      SELECT product_id,vendor_id,retail_price_minor
      FROM jsonb_to_recordset($1::jsonb)
        AS r(product_id text,vendor_id text,retail_price_minor bigint)
    )
    SELECT DISTINCT ON (r.product_id,r.vendor_id,r.retail_price_minor)
      r.product_id,
      r.vendor_id,
      r.retail_price_minor,
      vo.msrp_minor
    FROM requested r
    JOIN canonical_variants cv ON cv.public_id=r.product_id
    JOIN vendor_businesses vb ON vb.public_id=r.vendor_id
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id AND vo.vendor_id=vb.id
    WHERE vo.status='approved'
      AND vo.customer_price_minor=r.retail_price_minor
      AND vo.msrp_minor IS NOT NULL
      AND vo.msrp_minor>vo.customer_price_minor
      AND (
        vo.show_msrp=true
        OR EXISTS (
          SELECT 1
          FROM dropship_supplier_offers dso
          JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
          WHERE dso.vendor_offer_id=vo.id
            AND dso.active=true
            AND ds.active=true
        )
      )
    ORDER BY r.product_id,r.vendor_id,r.retail_price_minor,vo.updated_at DESC,vo.public_id
  `, [JSON.stringify(requested)]);

  return NextResponse.json({
    items: result.rows.map((row) => ({
      productId: row.product_id,
      vendorId: row.vendor_id,
      retailPriceMinor: Number(row.retail_price_minor),
      msrpMinor: Number(row.msrp_minor)
    }))
  }, { headers: { "Cache-Control": "no-store" } });
}

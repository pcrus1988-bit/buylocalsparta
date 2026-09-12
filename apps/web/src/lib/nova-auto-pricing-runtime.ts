import type { SqlRow } from "@buy-local-sparta/core";
import { calculateNovaBrandsGatewayRecommendation } from "./nova-brandsgateway-pricing";
import { novaBrandsGatewaySourceCategoryPath } from "./nova-brandsgateway-source-category";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const SUPPLIER_CODE = "nova_brandsgateway";
const AUTO_PRICING_CURSOR_KEY = "novaAutoPricingCursorV2";
const DEFAULT_BATCH_SIZE = 1_000;
const MAX_BATCH_SIZE = 5_000;

export type NovaAutoPricingSliceResult = Readonly<{
  enabled: boolean;
  scanned: number;
  autoPriced: number;
  overpriced: number;
  missingCost: number;
  manualOverrides: number;
  cursorWrapped: boolean;
  message?: string;
}>;

type PricingRow = Readonly<{
  offerId: string;
  vendorId: string;
  supplierCostMinor: number | null;
  msrpMinor: number | null;
  sourcePayload: Readonly<Record<string, unknown>>;
  categoryDetails: unknown;
  categories: unknown;
  cursor: string;
}>;

type PricingUpdate = Readonly<{
  offerId: string;
  vendorId: string;
  supplierCostMinor: number | null;
  sellingPriceMinor: number | null;
  markupPercent: number | null;
  profitMinor: number | null;
  profitPercent: number | null;
  pricingFlag: "OVERPRICED" | "UNPRICED_MISSING_COST" | null;
  sourceCategoryPath: string | null;
  overpricedByMinor: number | null;
  overpricedByPercent: number | null;
}>;

export function novaAutoPricingEnabled(): boolean {
  return process.env.BLS_NOVA_AUTO_PRICING_ENABLED?.trim().toLowerCase() === "true";
}

export async function runNovaAutoPricingSlice(): Promise<NovaAutoPricingSliceResult> {
  if (!novaAutoPricingEnabled()) {
    return emptyResult(false, "auto_pricing_disabled");
  }

  const pool = getProductionPostgresRuntime().sqlPool;
  const context = await pool.query<SqlRow>(`
    SELECT ds.id::text supplier_id,
           ds.owner_vendor_id::text vendor_id,
           ds.catalog_source_id::text source_id,
           cs.metadata->>$2 cursor
      FROM public.dropship_suppliers ds
      JOIN public.catalog_sources cs ON cs.id=ds.catalog_source_id
     WHERE ds.code=$1
       AND ds.active=true
       AND ds.catalogue_sync_enabled=true
       AND ds.catalog_source_id IS NOT NULL
     LIMIT 1
  `, [SUPPLIER_CODE, AUTO_PRICING_CURSOR_KEY]);

  const supplier = context.rows[0];
  if (!supplier) return emptyResult(false, "supplier_disabled_or_missing_source");

  const supplierId = String(supplier.supplier_id);
  const vendorId = String(supplier.vendor_id);
  const sourceId = String(supplier.source_id);
  const cursor = optionalText(supplier.cursor);

  const rows = await pool.query<SqlRow>(`
    SELECT dso.public_id cursor,
           vo.id::text offer_id,
           vo.vendor_id::text vendor_id,
           vo.msrp_minor,
           vo.source_payload,
           dso.supplier_cost_minor,
           csp.normalized_payload->'categoryDetails' category_details,
           csp.normalized_payload->'categories' categories
      FROM public.dropship_supplier_offers dso
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      LEFT JOIN public.catalog_source_products csp ON csp.id=dso.source_product_id
     WHERE dso.supplier_id=$1::uuid
       AND vo.vendor_id=$2::uuid
       AND ($3::text IS NULL OR dso.public_id>$3)
     ORDER BY dso.public_id
     LIMIT $4
  `, [supplierId, vendorId, cursor, batchSize()]);

  if (!rows.rows.length) {
    if (cursor) {
      await persistCursor(sourceId, null);
      return { ...emptyResult(true, "auto_pricing_cursor_wrapped"), cursorWrapped: true };
    }
    return emptyResult(true, "auto_pricing_source_empty");
  }

  const updates: PricingUpdate[] = [];
  let manualOverrides = 0;
  let overpriced = 0;
  let missingCost = 0;
  let lastCursor: string | null = null;

  for (const raw of rows.rows) {
    const row: PricingRow = {
      offerId: String(raw.offer_id),
      vendorId: String(raw.vendor_id),
      supplierCostMinor: nullableMinor(raw.supplier_cost_minor),
      msrpMinor: nullableMinor(raw.msrp_minor),
      sourcePayload: record(raw.source_payload),
      categoryDetails: raw.category_details,
      categories: raw.categories,
      cursor: String(raw.cursor)
    };
    lastCursor = row.cursor;

    if (row.sourcePayload.pricingManualOverride === true) {
      manualOverrides += 1;
      continue;
    }

    const sourceCategoryPath = novaBrandsGatewaySourceCategoryPath(row.categoryDetails, row.categories);
    const recommendation = calculateNovaBrandsGatewayRecommendation({
      supplierCostMinor: row.supplierCostMinor,
      msrpMinor: row.msrpMinor,
      category: sourceCategoryPath
    });

    if (recommendation.recommendedSellingPriceMinor == null || recommendation.recommendedMarkupPercent == null) {
      missingCost += 1;
      updates.push({
        offerId: row.offerId,
        vendorId: row.vendorId,
        supplierCostMinor: row.supplierCostMinor,
        sellingPriceMinor: null,
        markupPercent: null,
        profitMinor: null,
        profitPercent: null,
        pricingFlag: "UNPRICED_MISSING_COST",
        sourceCategoryPath,
        overpricedByMinor: null,
        overpricedByPercent: null
      });
      continue;
    }

    if (recommendation.overpriced) {
      overpriced += 1;
      updates.push({
        offerId: row.offerId,
        vendorId: row.vendorId,
        supplierCostMinor: row.supplierCostMinor,
        sellingPriceMinor: null,
        markupPercent: null,
        profitMinor: recommendation.recommendedProfitMinor,
        profitPercent: recommendation.recommendedProfitPercent,
        pricingFlag: "OVERPRICED",
        sourceCategoryPath,
        overpricedByMinor: recommendation.overpricedByMinor,
        overpricedByPercent: recommendation.overpricedByPercent
      });
      continue;
    }

    updates.push({
      offerId: row.offerId,
      vendorId: row.vendorId,
      supplierCostMinor: row.supplierCostMinor,
      sellingPriceMinor: recommendation.recommendedSellingPriceMinor,
      markupPercent: recommendation.recommendedMarkupPercent,
      profitMinor: recommendation.recommendedProfitMinor,
      profitPercent: recommendation.recommendedProfitPercent,
      pricingFlag: null,
      sourceCategoryPath,
      overpricedByMinor: null,
      overpricedByPercent: null
    });
  }

  if (updates.length) await applyUpdates(updates);
  if (lastCursor) await persistCursor(sourceId, lastCursor);

  return {
    enabled: true,
    scanned: rows.rowCount ?? rows.rows.length,
    autoPriced: updates.filter((item) => item.sellingPriceMinor != null).length,
    overpriced,
    missingCost,
    manualOverrides,
    cursorWrapped: false
  };
}

async function applyUpdates(updates: readonly PricingUpdate[]): Promise<void> {
  const payload = JSON.stringify(updates.map((item) => ({
    offer_id: item.offerId,
    vendor_id: item.vendorId,
    supplier_cost_minor: item.supplierCostMinor,
    selling_price_minor: item.sellingPriceMinor,
    markup_percent: item.markupPercent,
    profit_minor: item.profitMinor,
    profit_percent: item.profitPercent,
    pricing_flag: item.pricingFlag,
    source_category_path: item.sourceCategoryPath,
    overpriced_by_minor: item.overpricedByMinor,
    overpriced_by_percent: item.overpricedByPercent
  })));

  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      WITH x AS (
        SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS r(
            offer_id uuid,
            vendor_id uuid,
            supplier_cost_minor bigint,
            selling_price_minor bigint,
            markup_percent numeric,
            profit_minor bigint,
            profit_percent numeric,
            pricing_flag text,
            source_category_path text,
            overpriced_by_minor bigint,
            overpriced_by_percent numeric
          )
      )
      UPDATE public.vendor_offers vo
         SET customer_price_minor=COALESCE(x.selling_price_minor,vo.customer_price_minor),
             source_payload=(COALESCE(vo.source_payload,'{}'::jsonb) - 'pricingFlag')
               || jsonb_build_object(
                    'pricingPending', x.selling_price_minor IS NULL,
                    'pricingManagedBy', 'nova_auto_v2',
                    'pricingFlag', x.pricing_flag,
                    'pricingEngine', jsonb_build_object(
                      'version', 2,
                      'rule', '4.90_9.90',
                      'sourceCategoryPath', x.source_category_path,
                      'profitMinor', x.profit_minor,
                      'profitPercent', x.profit_percent,
                      'overpricedByMinor', x.overpriced_by_minor,
                      'overpricedByPercent', x.overpriced_by_percent,
                      'calculatedAt', now()
                    )
                  ),
             updated_at=CASE
               WHEN x.selling_price_minor IS DISTINCT FROM vo.customer_price_minor
                 OR COALESCE(vo.source_payload->>'pricingFlag','') IS DISTINCT FROM COALESCE(x.pricing_flag,'')
                 OR COALESCE(vo.source_payload->>'pricingManagedBy','') <> 'nova_auto_v2'
               THEN now()
               ELSE vo.updated_at
             END
        FROM x
       WHERE vo.id=x.offer_id
         AND vo.vendor_id=x.vendor_id
         AND COALESCE(vo.source_payload->>'pricingManualOverride','false') <> 'true'
    `, [payload]);

    await client.query(`
      INSERT INTO public.vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,
        discount_type,discount_value,created_at,updated_at
      )
      SELECT x.offer_id,x.vendor_id,x.supplier_cost_minor,'calculated','percent',x.markup_percent,
             NULL,NULL,now(),now()
        FROM jsonb_to_recordset($1::jsonb) AS x(
          offer_id uuid,
          vendor_id uuid,
          supplier_cost_minor bigint,
          selling_price_minor bigint,
          markup_percent numeric
        )
       WHERE x.selling_price_minor IS NOT NULL
         AND x.markup_percent IS NOT NULL
      ON CONFLICT(offer_id) DO UPDATE SET
        buying_price_minor=EXCLUDED.buying_price_minor,
        pricing_mode='calculated',
        markup_type='percent',
        markup_value=EXCLUDED.markup_value,
        discount_type=NULL,
        discount_value=NULL,
        updated_at=CASE
          WHEN public.vendor_offer_pricing_private.buying_price_minor IS DISTINCT FROM EXCLUDED.buying_price_minor
            OR public.vendor_offer_pricing_private.pricing_mode IS DISTINCT FROM 'calculated'
            OR public.vendor_offer_pricing_private.markup_type IS DISTINCT FROM 'percent'
            OR public.vendor_offer_pricing_private.markup_value IS DISTINCT FROM EXCLUDED.markup_value
            OR public.vendor_offer_pricing_private.discount_type IS NOT NULL
            OR public.vendor_offer_pricing_private.discount_value IS NOT NULL
          THEN now()
          ELSE public.vendor_offer_pricing_private.updated_at
        END
    `, [payload]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function persistCursor(sourceId: string, cursor: string | null): Promise<void> {
  const pool = getProductionPostgresRuntime().sqlPool;
  if (cursor === null) {
    await pool.query(`
      UPDATE public.catalog_sources
         SET metadata=COALESCE(metadata,'{}'::jsonb)-$2,
             updated_at=now()
       WHERE id=$1::uuid
    `, [sourceId, AUTO_PRICING_CURSOR_KEY]);
    return;
  }
  await pool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),ARRAY[$2]::text[],to_jsonb($3::text),true),
           updated_at=now()
     WHERE id=$1::uuid
  `, [sourceId, AUTO_PRICING_CURSOR_KEY, cursor]);
}

function batchSize(): number {
  const value = Number(process.env.BLS_NOVA_AUTO_PRICING_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(MAX_BATCH_SIZE, value) : DEFAULT_BATCH_SIZE;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableMinor(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function emptyResult(enabled: boolean, message?: string): NovaAutoPricingSliceResult {
  return { enabled, scanned: 0, autoPriced: 0, overpriced: 0, missingCost: 0, manualOverrides: 0, cursorWrapped: false, message };
}

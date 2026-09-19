import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  calculateSymphonyaRetailPrice,
  symphonyaPricingConfig
} from "./symphonya-pricing";

const SUPPLIER_CODE = "symphonya";
const CURSOR_KEY = "symphonyaAutoPricingCursorV1";
const DEFAULT_BATCH_SIZE = 1_000;
const MAX_BATCH_SIZE = 5_000;

export type SymphonyaAutoPricingSliceResult = Readonly<{
  enabled: boolean;
  scanned: number;
  priced: number;
  missingCost: number;
  manualOverrides: number;
  priceHoldsMadeSafe: number;
  cursorWrapped: boolean;
  message?: string;
}>;

type PricingUpdate = Readonly<{
  offerId: string;
  vendorId: string;
  supplierCostMinor: number | null;
  sellingPriceMinor: number | null;
  markupPercent: number | null;
  discountPercent: number | null;
  profitMinor: number | null;
  profitPercent: number | null;
  priceHeld: boolean;
}>;

type SupplierPricingDefaults = Readonly<{
  markupPercent: number;
  discountPercent: number;
}>;

type ActivePricingPolicy = Readonly<{
  managedBy: string;
  rule: string;
  markupRate: number;
  discountRate: number;
  minimumProfitMinor: number;
  transactionRate: number;
}>;

export function symphonyaAutoPricingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLS_SYMPHONYA_AUTO_PRICING_ENABLED?.trim().toLowerCase() !== "false";
}

export async function runSymphonyaAutoPricingSlice(): Promise<SymphonyaAutoPricingSliceResult> {
  if (!symphonyaAutoPricingEnabled()) return emptyResult(false, "auto_pricing_disabled");

  const pool = getProductionPostgresRuntime().sqlPool;
  const context = await pool.query<SqlRow>(`
    SELECT ds.id::text supplier_id,
           ds.owner_vendor_id::text vendor_id,
           ds.catalog_source_id::text source_id,
           ds.configuration->'vendorMerchandising' vendor_merchandising,
           cs.metadata->>$2 cursor
      FROM public.dropship_suppliers ds
      JOIN public.catalog_sources cs ON cs.id=ds.catalog_source_id
     WHERE ds.code=$1
       AND ds.active=true
       AND ds.catalogue_sync_enabled=true
       AND ds.catalog_source_id IS NOT NULL
     LIMIT 1
  `, [SUPPLIER_CODE, CURSOR_KEY]);

  const supplier = context.rows[0];
  if (!supplier) return emptyResult(false, "supplier_disabled_or_missing_source");

  const supplierId = requiredText(supplier.supplier_id, "supplier id");
  const vendorId = requiredText(supplier.vendor_id, "vendor id");
  const sourceId = requiredText(supplier.source_id, "source id");
  const cursor = optionalText(supplier.cursor);
  const supplierDefaults = parseSupplierPricingDefaults(supplier.vendor_merchandising);
  const fallbackConfig = symphonyaPricingConfig();
  const policy: ActivePricingPolicy = supplierDefaults
    ? {
        managedBy: "supplier_defaults_v1",
        rule: "supplier_markup_discount_v1",
        markupRate: supplierDefaults.markupPercent / 100,
        discountRate: supplierDefaults.discountPercent / 100,
        minimumProfitMinor: 0,
        transactionRate: 0
      }
    : {
        managedBy: "symphonya_auto_v1",
        rule: "sym_v1_markup_and_min_contribution",
        markupRate: fallbackConfig.markupRate,
        discountRate: 0,
        minimumProfitMinor: fallbackConfig.minimumProfitMinor,
        transactionRate: fallbackConfig.transactionRate
      };

  const unmanaged = await loadRows({
    supplierId,
    vendorId,
    cursor: null,
    unmanagedOnly: true,
    managedBy: policy.managedBy,
    limit: batchSize()
  });
  const catchingUp = unmanaged.rows.length > 0;
  const rows = catchingUp
    ? unmanaged
    : await loadRows({ supplierId, vendorId, cursor, unmanagedOnly: false, managedBy: policy.managedBy, limit: batchSize() });

  if (!rows.rows.length) {
    if (cursor) {
      await persistCursor(sourceId, null);
      return { ...emptyResult(true, "auto_pricing_cursor_wrapped"), cursorWrapped: true };
    }
    return emptyResult(true, "auto_pricing_source_empty");
  }

  const updates: PricingUpdate[] = [];
  let missingCost = 0;
  let manualOverrides = 0;
  let lastCursor: string | null = null;

  for (const row of rows.rows) {
    lastCursor = requiredText(row.cursor, "pricing cursor");
    const sourcePayload = record(row.source_payload);
    if (sourcePayload.pricingManualOverride === true) {
      manualOverrides += 1;
      continue;
    }

    const supplierCostMinor = nullableMinor(row.effective_supplier_cost_minor);
    const priceHeld = row.price_held === true;
    const recommendation = supplierDefaults
      ? calculateSupplierDefaultsPrice(supplierCostMinor, supplierDefaults)
      : calculateSymphonyaRetailPrice(supplierCostMinor, fallbackConfig);
    if (recommendation.sellingPriceMinor == null || recommendation.markupPercent == null) {
      missingCost += 1;
    }
    updates.push({
      offerId: requiredText(row.offer_id, "offer id"),
      vendorId: requiredText(row.vendor_id, "vendor id"),
      supplierCostMinor,
      sellingPriceMinor: recommendation.sellingPriceMinor,
      markupPercent: supplierDefaults ? supplierDefaults.markupPercent : recommendation.markupPercent,
      discountPercent: supplierDefaults && supplierDefaults.discountPercent > 0 ? supplierDefaults.discountPercent : null,
      profitMinor: recommendation.profitMinor,
      profitPercent: recommendation.profitPercent,
      priceHeld
    });
  }

  if (updates.length) await applyUpdates(updates, policy);
  if (lastCursor && !catchingUp) await persistCursor(sourceId, lastCursor);

  const priced = updates.filter((item) => item.sellingPriceMinor !== null).length;
  return {
    enabled: true,
    scanned: rows.rowCount ?? rows.rows.length,
    priced,
    missingCost,
    manualOverrides,
    priceHoldsMadeSafe: updates.filter((item) => item.priceHeld && item.sellingPriceMinor !== null).length,
    cursorWrapped: false,
    message: catchingUp ? "auto_pricing_unmanaged_catchup" : undefined
  };
}

async function loadRows(input: Readonly<{
  supplierId: string;
  vendorId: string;
  cursor: string | null;
  unmanagedOnly: boolean;
  managedBy: string;
  limit: number;
}>) {
  const pool = getProductionPostgresRuntime().sqlPool;
  if (input.unmanagedOnly) {
    // The catch-up path is not cursor-driven. Read the small pricing-state
    // subset first, then join to the supplier offer, rather than walking every
    // Symphonya offer in public_id order on each pass.
    return pool.query<SqlRow>(`
      SELECT dso.public_id cursor,
             vo.id::text offer_id,
             vo.vendor_id::text vendor_id,
             vo.source_payload,
             CASE
               WHEN COALESCE(dso.availability_payload->>'priceHeld','false')='true'
                AND NULLIF(dso.availability_payload->>'pendingSupplierCostMinor','') IS NOT NULL
               THEN (dso.availability_payload->>'pendingSupplierCostMinor')::bigint
               ELSE dso.supplier_cost_minor
             END effective_supplier_cost_minor,
             COALESCE(dso.availability_payload->>'priceHeld','false')='true' AS price_held
        FROM public.vendor_offers vo
        JOIN public.dropship_supplier_offers dso
          ON dso.vendor_offer_id=vo.id
         AND dso.supplier_id=$2::uuid
       WHERE vo.vendor_id=$1::uuid
         AND vo.source_payload->>'supplierCode'='symphonya'
         AND COALESCE(vo.source_payload->>'pricingManagedBy','') <> $3
         AND COALESCE(vo.source_payload->>'pricingManualOverride','false') <> 'true'
       ORDER BY vo.id
       LIMIT $4
    `, [input.vendorId, input.supplierId, input.managedBy, input.limit]);
  }

  return pool.query<SqlRow>(`
    SELECT dso.public_id cursor,
           vo.id::text offer_id,
           vo.vendor_id::text vendor_id,
           vo.source_payload,
           CASE
             WHEN COALESCE(dso.availability_payload->>'priceHeld','false')='true'
              AND NULLIF(dso.availability_payload->>'pendingSupplierCostMinor','') IS NOT NULL
             THEN (dso.availability_payload->>'pendingSupplierCostMinor')::bigint
             ELSE dso.supplier_cost_minor
           END effective_supplier_cost_minor,
           COALESCE(dso.availability_payload->>'priceHeld','false')='true' AS price_held
      FROM public.dropship_supplier_offers dso
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
     WHERE dso.supplier_id=$1::uuid
       AND vo.vendor_id=$2::uuid
       AND ($3::text IS NULL OR dso.public_id>$3)
     ORDER BY dso.public_id
     LIMIT $4
  `, [input.supplierId, input.vendorId, input.cursor, input.limit]);
}
async function applyUpdates(
  updates: readonly PricingUpdate[],
  policy: ActivePricingPolicy
): Promise<void> {
  const payload = JSON.stringify(updates.map((item) => ({
    offer_id: item.offerId,
    vendor_id: item.vendorId,
    supplier_cost_minor: item.supplierCostMinor,
    selling_price_minor: item.sellingPriceMinor,
    markup_percent: item.markupPercent,
    discount_percent: item.discountPercent,
    profit_minor: item.profitMinor,
    profit_percent: item.profitPercent,
    price_held: item.priceHeld
  })));

  const pool = getProductionPostgresRuntime().sqlPool;
  const client = await pool.connect();
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
          price_held boolean
        )
      )
      UPDATE public.vendor_offers vo
         SET supplier_unit_price_minor=COALESCE(x.supplier_cost_minor,vo.supplier_unit_price_minor),
             customer_price_minor=COALESCE(x.selling_price_minor,vo.customer_price_minor),
             customer_price_updated_at=CASE WHEN x.selling_price_minor IS NOT NULL THEN now() ELSE vo.customer_price_updated_at END,
             source_payload=(COALESCE(vo.source_payload,'{}'::jsonb)-'pricingFlag')
               || jsonb_build_object(
                    'pricingPending',x.selling_price_minor IS NULL,
                    'pricingManagedBy',$2::text,
                    'pricingFlag',CASE WHEN x.selling_price_minor IS NULL THEN 'UNPRICED_MISSING_COST' ELSE NULL END,
                    'pricingEngine',jsonb_build_object(
                      'version',2,
                      'rule',$3::text,
                      'markupRate',$4::numeric,
                      'discountRate',$5::numeric,
                      'minimumProfitMinor',$6::int,
                      'transactionRate',$7::numeric,
                      'profitMinor',x.profit_minor,
                      'profitPercent',x.profit_percent,
                      'calculatedAt',now()
                    )
                  ),
             updated_at=now()
        FROM x
       WHERE vo.id=x.offer_id
         AND vo.vendor_id=x.vendor_id
         AND COALESCE(vo.source_payload->>'pricingManualOverride','false') <> 'true'
    `, [payload, policy.managedBy, policy.rule, policy.markupRate, policy.discountRate, policy.minimumProfitMinor, policy.transactionRate]);

    await client.query(`
      INSERT INTO public.vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,
        discount_type,discount_value,created_at,updated_at
      )
      SELECT x.offer_id,x.vendor_id,x.supplier_cost_minor,'calculated','percent',x.markup_percent,
             CASE WHEN x.discount_percent IS NOT NULL AND x.discount_percent > 0 THEN 'percent' ELSE NULL END,
             CASE WHEN x.discount_percent IS NOT NULL AND x.discount_percent > 0 THEN x.discount_percent ELSE NULL END,
             now(),now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        offer_id uuid,
        vendor_id uuid,
        supplier_cost_minor bigint,
        selling_price_minor bigint,
        markup_percent numeric,
        discount_percent numeric
      )
      WHERE x.supplier_cost_minor IS NOT NULL
        AND x.selling_price_minor IS NOT NULL
        AND x.markup_percent IS NOT NULL
      ON CONFLICT(offer_id) DO UPDATE SET
        buying_price_minor=EXCLUDED.buying_price_minor,
        pricing_mode='calculated',
        markup_type='percent',
        markup_value=EXCLUDED.markup_value,
        discount_type=CASE WHEN EXCLUDED.discount_value IS NOT NULL THEN 'percent' ELSE NULL END,
        discount_value=EXCLUDED.discount_value,
        updated_at=now()
    `, [payload]);

    await client.query(`
      WITH x AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS r(
          offer_id uuid,
          supplier_cost_minor bigint,
          selling_price_minor bigint,
          price_held boolean
        )
      )
      UPDATE public.dropship_supplier_offers dso
         SET availability_payload=jsonb_set(
               COALESCE(dso.availability_payload,'{}'::jsonb),
               '{pricingSafeForSupplierConfirm}',
               'true'::jsonb,
               true
             ),
             updated_at=now()
        FROM x
       WHERE dso.vendor_offer_id=x.offer_id
         AND x.price_held=true
         AND x.supplier_cost_minor IS NOT NULL
         AND x.selling_price_minor IS NOT NULL
         AND x.selling_price_minor>=x.supplier_cost_minor
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
    `, [sourceId, CURSOR_KEY]);
    return;
  }
  await pool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),ARRAY[$2]::text[],to_jsonb($3::text),true),
           updated_at=now()
     WHERE id=$1::uuid
  `, [sourceId, CURSOR_KEY, cursor]);
}

function parseSupplierPricingDefaults(value: unknown): SupplierPricingDefaults | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const markupPercent = Number(raw.markupPercent);
  const discountPercent = Number(raw.discountPercent);
  if (Number(raw.version) !== 1) return null;
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000) return null;
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) return null;
  const finalFactor = (1 + markupPercent / 100) * (1 - discountPercent / 100);
  if (finalFactor < 1) return null;
  return {
    markupPercent,
    discountPercent
  };
}

function calculateSupplierDefaultsPrice(
  supplierCostMinor: number | null,
  defaults: SupplierPricingDefaults
) {
  if (supplierCostMinor == null || !Number.isSafeInteger(supplierCostMinor) || supplierCostMinor <= 0) {
    return {
      sellingPriceMinor: null,
      markupPercent: null,
      profitMinor: null,
      profitPercent: null,
      supplierCostMinor,
      rule: "supplier_markup_discount_v1"
    };
  }

  const afterMarkupMinor = supplierCostMinor
    + Math.round(supplierCostMinor * defaults.markupPercent / 100);
  const sellingPriceMinor = Math.max(
    supplierCostMinor,
    afterMarkupMinor - Math.round(afterMarkupMinor * defaults.discountPercent / 100)
  );
  const profitMinor = sellingPriceMinor - supplierCostMinor;
  const effectiveMarkupPercent = Math.round(
    (((sellingPriceMinor - supplierCostMinor) / supplierCostMinor) * 100 + Number.EPSILON) * 100
  ) / 100;
  const profitPercent = sellingPriceMinor > 0
    ? Math.round(((profitMinor / sellingPriceMinor) * 100 + Number.EPSILON) * 100) / 100
    : null;

  return {
    sellingPriceMinor,
    markupPercent: effectiveMarkupPercent,
    profitMinor,
    profitPercent,
    supplierCostMinor,
    rule: "supplier_markup_discount_v1"
  };
}

function batchSize(): number {
  const value = Number(process.env.BLS_SYMPHONYA_AUTO_PRICING_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(MAX_BATCH_SIZE, value) : DEFAULT_BATCH_SIZE;
}

function nullableMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function requiredText(value: unknown, label: string): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function emptyResult(enabled: boolean, message?: string): SymphonyaAutoPricingSliceResult {
  return {
    enabled,
    scanned: 0,
    priced: 0,
    missingCost: 0,
    manualOverrides: 0,
    priceHoldsMadeSafe: 0,
    cursorWrapped: false,
    message
  };
}

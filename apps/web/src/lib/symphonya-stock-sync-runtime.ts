import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { SymphonyaHttpTransport } from "../../../../integrations/dropship-suppliers/src/symphonya-http.ts";
import type { SymphonyaStockRow } from "../../../../integrations/dropship-suppliers/src/symphonya-v1.ts";

const SOURCE_CODE = "symphonya";
const SUPPLIER_CODE = "symphonya";
const DEFAULT_LIMIT = 500;
const DEFAULT_MAX_PAGES_PER_SLICE = 20;
const LEASE_MS = 55_000;
const SLICE_MS = 47_000;
const AVAILABILITY_TTL_MINUTES = 10;

type StockSyncState = {
  version: 1;
  nextPage: number;
  limit: number;
  cycleStartedAt: string;
  pagesCompleted: number;
  rowsObserved: number;
  lastSuccessfulAt?: string;
  lastSuccessfulPage?: number;
  lastCycleCompletedAt?: string;
  lastError?: string | null;
  leaseUntil?: string | null;
};

export type SymphonyaStockSyncResult = Readonly<{
  claimed: boolean;
  pages: number;
  rows: number;
  offersUpdated: number;
  cycleComplete: boolean;
  message?: string;
}>;

export async function runSymphonyaStockSyncSlice(): Promise<SymphonyaStockSyncResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const claimed = await pool.query<SqlRow>(`
    UPDATE public.catalog_sources cs
       SET metadata=jsonb_set(
             COALESCE(cs.metadata,'{}'::jsonb),
             '{symphonyaStockSync}',
             COALESCE(cs.metadata->'symphonyaStockSync','{}'::jsonb)
               || jsonb_build_object('leaseUntil',now()+interval '55 seconds','lastAttemptAt',now()),
             true
           ),
           updated_at=now()
     WHERE cs.code=$1
       AND cs.active=true
       AND EXISTS (
         SELECT 1 FROM public.dropship_suppliers ds
          WHERE ds.catalog_source_id=cs.id
            AND ds.code=$2
            AND ds.active=true
            AND ds.api_authoritative_availability=true
       )
       AND (
         NULLIF(cs.metadata #>> '{symphonyaStockSync,leaseUntil}','') IS NULL
         OR (cs.metadata #>> '{symphonyaStockSync,leaseUntil}')::timestamptz < now()
       )
    RETURNING cs.id,cs.metadata
  `, [SOURCE_CODE, SUPPLIER_CODE]);

  const claimedRow = claimed.rows[0];
  if (!claimedRow) return { claimed: false, pages: 0, rows: 0, offersUpdated: 0, cycleComplete: false, message: "disabled_or_busy" };
  const sourceId = String(claimedRow.id);
  let state = parseState((claimedRow.metadata as Record<string, unknown> | undefined)?.symphonyaStockSync);
  state.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  state.lastError = null;
  await saveState(sourceId, state);

  const transport = new SymphonyaHttpTransport({
    apiKey: apiKey(),
    baseUrl: process.env.SYMPHONYA_API_BASE_URL,
    requestTimeoutMs: timeoutMs()
  });
  const deadline = Date.now() + SLICE_MS;
  let pages = 0;
  let rows = 0;
  let offersUpdated = 0;
  let cycleComplete = false;

  try {
    while (Date.now() < deadline && pages < maxPagesPerSlice()) {
      const pageNumber = state.nextPage;
      const page = await transport.getStock({ page: pageNumber, limit: state.limit });
      const updated = await persistStockRows(page);
      pages += 1;
      rows += page.length;
      offersUpdated += updated;
      state.pagesCompleted += 1;
      state.rowsObserved += page.length;
      state.lastSuccessfulAt = new Date().toISOString();
      state.lastSuccessfulPage = pageNumber;
      state.nextPage = pageNumber + 1;
      cycleComplete = page.length < state.limit;

      if (cycleComplete) {
        state.lastCycleCompletedAt = state.lastSuccessfulAt;
        state.nextPage = 1;
        state.cycleStartedAt = new Date().toISOString();
        state.pagesCompleted = 0;
        state.rowsObserved = 0;
      }
      await saveState(sourceId, state);
      if (cycleComplete) break;
    }

    state.leaseUntil = null;
    await saveState(sourceId, state);
    return { claimed: true, pages, rows, offersUpdated, cycleComplete };
  } catch (error) {
    state.lastError = safeError(error);
    state.leaseUntil = null;
    await saveState(sourceId, state).catch(() => undefined);
    throw error;
  }
}

/** Checkout/pre-fulfilment targeted validation path. */
export async function refreshSymphonyaOfferStockByExternalIds(productIds: readonly string[]): Promise<number> {
  const ids = [...new Set(productIds.map((value) => value.trim()).filter(Boolean))];
  if (!ids.length) return 0;
  const transport = new SymphonyaHttpTransport({
    apiKey: apiKey(),
    baseUrl: process.env.SYMPHONYA_API_BASE_URL,
    requestTimeoutMs: timeoutMs()
  });
  const requestBatches: string[][] = [];
  for (let index = 0; index < ids.length; index += 200) {
    requestBatches.push(ids.slice(index, index + 200));
  }

  // Two 200-ID getStock requests for the storefront-priority slice can run in
  // parallel. Sequential calls were exceeding the 55-second serverless budget
  // even though each individual supplier request completed successfully.
  const returnedBatches = await Promise.all(
    requestBatches.map((requestedIds) => transport.getStock({ productIds: requestedIds }))
  );

  const rows: SymphonyaStockRow[] = [];
  for (let index = 0; index < requestBatches.length; index += 1) {
    const requestedIds = requestBatches[index] ?? [];
    const returned = returnedBatches[index] ?? [];
    const returnedIds = new Set(returned.map((row) => row.productId));
    rows.push(...returned);
    // A targeted getStock miss is authoritative unavailability for this check.
    // Persist it as fresh unavailable state so missing IDs cannot stay stale at
    // the front of the refresh queue and starve the remaining published offers.
    for (const productId of requestedIds) {
      if (returnedIds.has(productId)) continue;
      rows.push({
        productId,
        quantity: 0,
        permitted: false,
        priceHeld: false,
        raw: { reason: "not_returned_by_getStock" }
      });
    }
  }
  return persistStockRows(rows);
}

async function persistStockRows(stockRows: readonly SymphonyaStockRow[]): Promise<number> {
  if (!stockRows.length) return 0;
  const payload = stockRows.map((row) => ({
    external_product_id: row.productId,
    ean: row.ean ?? null,
    quantity: Math.max(0, Math.floor(row.quantity)),
    warehouse_code: row.warehouse ?? null,
    supplier_cost_minor: row.wholesaleCostMinor ?? null,
    supplier_currency: row.currency ?? "EUR",
    supplier_permitted: row.permitted,
    price_held: row.priceHeld === true,
    raw: row.raw
  }));

  const updated = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH stock AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        external_product_id text,
        ean text,
        quantity integer,
        warehouse_code text,
        supplier_cost_minor bigint,
        supplier_currency text,
        supplier_permitted boolean,
        price_held boolean,
        raw jsonb
      )
    ), supplier AS (
      SELECT id FROM public.dropship_suppliers WHERE code=$2 LIMIT 1
    )
    UPDATE public.dropship_supplier_offers dso
       SET ean=COALESCE(stock.ean,dso.ean),
           warehouse_code=COALESCE(stock.warehouse_code,dso.warehouse_code),
           supplier_cost_minor=CASE
             WHEN COALESCE(dso.availability_payload->>'priceHeld','false')='true' THEN dso.supplier_cost_minor
             ELSE COALESCE(stock.supplier_cost_minor,dso.supplier_cost_minor)
           END,
           supplier_currency=COALESCE(stock.supplier_currency,dso.supplier_currency),
           cached_available=(stock.quantity>0 AND stock.supplier_permitted AND stock.price_held=false
             AND COALESCE(dso.availability_payload->>'priceHeld','false')<>'true'),
           cached_quantity=CASE
             WHEN stock.supplier_permitted=false OR stock.price_held=true
               OR COALESCE(dso.availability_payload->>'priceHeld','false')='true' THEN 0
             ELSE stock.quantity
           END,
           availability_checked_at=now(),
           availability_expires_at=now()+make_interval(mins=>$3::int),
           availability_payload=COALESCE(dso.availability_payload,'{}'::jsonb)
             || jsonb_build_object(
                  'source','symphonya_getStock',
                  'supplierPermitted',stock.supplier_permitted,
                  'stockQuantity',stock.quantity,
                  'warehouse',stock.warehouse_code,
                  'stockPayload',stock.raw,
                  'stockCheckedAt',now()
                ),
           updated_at=now()
      FROM stock,supplier
     WHERE dso.supplier_id=supplier.id
       AND (
         dso.external_product_id=stock.external_product_id
         OR (stock.ean IS NOT NULL AND dso.ean=stock.ean)
       )
    RETURNING dso.id
  `, [JSON.stringify(payload), SUPPLIER_CODE, AVAILABILITY_TTL_MINUTES]);
  return updated.rowCount ?? updated.rows.length;
}

async function saveState(sourceId: string, state: StockSyncState): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{symphonyaStockSync}',$2::jsonb,true),
           updated_at=now()
     WHERE id=$1::uuid
  `, [sourceId, JSON.stringify(state)]);
}

function parseState(value: unknown): StockSyncState {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    version: 1,
    nextPage: positiveIntegerValue(input.nextPage, 1),
    limit: Math.min(2_000, positiveIntegerValue(input.limit, DEFAULT_LIMIT)),
    cycleStartedAt: validIso(input.cycleStartedAt) ?? new Date().toISOString(),
    pagesCompleted: nonNegativeInteger(input.pagesCompleted),
    rowsObserved: nonNegativeInteger(input.rowsObserved),
    lastSuccessfulAt: validIso(input.lastSuccessfulAt) ?? undefined,
    lastSuccessfulPage: nullableInteger(input.lastSuccessfulPage) ?? undefined,
    lastCycleCompletedAt: validIso(input.lastCycleCompletedAt) ?? undefined,
    lastError: typeof input.lastError === "string" ? input.lastError.slice(0, 500) : null,
    leaseUntil: validIso(input.leaseUntil)
  };
}

function apiKey(): string {
  const value = process.env.SYMPHONYA_API_KEY?.trim();
  if (!value) throw new Error("SYMPHONYA_API_KEY is required for Symphonya stock sync");
  return value;
}

function timeoutMs(): number {
  const value = Number(process.env.SYMPHONYA_REQUEST_TIMEOUT_MS ?? 20_000);
  return Number.isSafeInteger(value) && value > 0 ? value : 20_000;
}

function maxPagesPerSlice(): number {
  const value = Number(process.env.SYMPHONYA_STOCK_MAX_PAGES_PER_SLICE ?? DEFAULT_MAX_PAGES_PER_SLICE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(50, value) : DEFAULT_MAX_PAGES_PER_SLICE;
}

function positiveIntegerValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nullableInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number {
  return nullableInteger(value) ?? 0;
}

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}

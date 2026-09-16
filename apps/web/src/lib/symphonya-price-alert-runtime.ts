import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { SymphonyaHttpTransport } from "../../../../integrations/dropship-suppliers/src/symphonya-http.ts";

const SOURCE_CODE = "symphonya";
const SUPPLIER_CODE = "symphonya";
const LEASE_MS = 55_000;

export type SymphonyaPriceAlertSweepResult = Readonly<{
  claimed: boolean;
  alerts: number;
  heldOffers: number;
  message?: string;
}>;

/**
 * Fetches supplier price alerts and immediately makes affected supplier offers
 * unavailable. It intentionally does NOT confirm the supplier change: acceptance
 * is a separate, fail-closed step after KONTA MOY pricing has been recomputed and
 * validated against the pending wholesale cost.
 */
export async function runSymphonyaPriceAlertSweep(): Promise<SymphonyaPriceAlertSweepResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const claimed = await pool.query<SqlRow>(`
    UPDATE public.catalog_sources cs
       SET metadata=jsonb_set(
             COALESCE(cs.metadata,'{}'::jsonb),
             '{symphonyaPriceAlerts}',
             COALESCE(cs.metadata->'symphonyaPriceAlerts','{}'::jsonb)
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
            AND ds.catalogue_sync_enabled=true
       )
       AND (
         NULLIF(cs.metadata #>> '{symphonyaPriceAlerts,leaseUntil}','') IS NULL
         OR (cs.metadata #>> '{symphonyaPriceAlerts,leaseUntil}')::timestamptz < now()
       )
    RETURNING cs.id
  `, [SOURCE_CODE, SUPPLIER_CODE]);
  const sourceId = claimed.rows[0]?.id ? String(claimed.rows[0].id) : null;
  if (!sourceId) return { claimed: false, alerts: 0, heldOffers: 0, message: "disabled_or_busy" };

  try {
    const transport = new SymphonyaHttpTransport({
      apiKey: symphonyaApiKey(),
      baseUrl: process.env.SYMPHONYA_API_BASE_URL,
      requestTimeoutMs: timeoutMs()
    });
    const changes = await transport.getPriceChanges();
    const payload = changes.map((change) => ({
      external_product_id: change.productId,
      ean: change.ean ?? null,
      old_cost_minor: change.oldCostMinor,
      new_cost_minor: change.newCostMinor,
      currency: change.currency,
      observed_at: new Date().toISOString(),
      raw: change.raw
    }));

    let heldOffers = 0;
    if (payload.length) {
      const updated = await pool.query<SqlRow>(`
        WITH alerts AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
            external_product_id text,
            ean text,
            old_cost_minor bigint,
            new_cost_minor bigint,
            currency text,
            observed_at timestamptz,
            raw jsonb
          )
        ), supplier AS (
          SELECT id FROM public.dropship_suppliers WHERE code=$2 LIMIT 1
        )
        UPDATE public.dropship_supplier_offers dso
           SET cached_available=false,
               cached_quantity=0,
               availability_checked_at=now(),
               availability_expires_at=NULL,
               active=false,
               availability_payload=COALESCE(dso.availability_payload,'{}'::jsonb)
                 || jsonb_build_object(
                      'priceHeld',true,
                      'priceHoldSource','symphonya_getPriceChanges',
                      'activeBeforePriceHold',CASE
                        WHEN COALESCE(dso.availability_payload->>'priceHeld','false')='true'
                        THEN COALESCE((dso.availability_payload->>'activeBeforePriceHold')::boolean,false)
                        ELSE dso.active
                      END,
                      'oldSupplierCostMinor',alerts.old_cost_minor,
                      'pendingSupplierCostMinor',alerts.new_cost_minor,
                      'pendingSupplierCurrency',alerts.currency,
                      'priceAlertObservedAt',alerts.observed_at,
                      'priceAlertPayload',alerts.raw
                    ),
               updated_at=now()
          FROM alerts, supplier
         WHERE dso.supplier_id=supplier.id
           AND (
             dso.external_product_id=alerts.external_product_id
             OR (alerts.ean IS NOT NULL AND dso.ean=alerts.ean)
           )
        RETURNING dso.id
      `, [JSON.stringify(payload), SUPPLIER_CODE]);
      heldOffers = updated.rowCount ?? updated.rows.length;
    }

    await pool.query(`
      UPDATE public.catalog_sources
         SET metadata=jsonb_set(
               COALESCE(metadata,'{}'::jsonb),
               '{symphonyaPriceAlerts}',
               (COALESCE(metadata->'symphonyaPriceAlerts','{}'::jsonb)-'leaseUntil')
                 || jsonb_build_object(
                      'lastSuccessfulAt',now(),
                      'lastAlertCount',$2::int,
                      'lastHeldOfferCount',$3::int
                    ),
               true
             ),
             updated_at=now()
       WHERE id=$1::uuid
    `, [sourceId, changes.length, heldOffers]);
    return { claimed: true, alerts: changes.length, heldOffers };
  } catch (error) {
    await releaseLease(sourceId, safeError(error)).catch(() => undefined);
    throw error;
  }
}

/**
 * Confirms only changes explicitly marked pricing-safe by a separate pricing
 * operation. This prevents the supplier API acknowledgement from ever being the
 * action that makes an unsafe new wholesale cost sellable.
 */
export async function confirmPricingSafeSymphonyaChanges(limit = 100): Promise<Readonly<{
  candidates: number;
  confirmed: number;
}>> {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 500) throw new Error("Symphonya confirmation limit must be between 1 and 500");
  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<SqlRow>(`
    SELECT dso.id::text offer_id,
           dso.external_product_id,
           dso.ean,
           dso.availability_payload->>'pendingSupplierCostMinor' pending_cost_minor
      FROM public.dropship_supplier_offers dso
      JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      LEFT JOIN public.vendor_offer_pricing_private vopp ON vopp.offer_id=vo.id
     WHERE ds.code=$1
       AND COALESCE(dso.availability_payload->>'priceHeld','false')='true'
       AND COALESCE(dso.availability_payload->>'pricingSafeForSupplierConfirm','false')='true'
       AND NULLIF(dso.availability_payload->>'pendingSupplierCostMinor','') IS NOT NULL
       AND vopp.buying_price_minor=(dso.availability_payload->>'pendingSupplierCostMinor')::bigint
       AND vo.customer_price_minor IS NOT NULL
       AND vo.customer_price_minor > 0
     ORDER BY dso.updated_at
     LIMIT $2
  `, [SUPPLIER_CODE, limit]);
  if (!candidates.rows.length) return { candidates: 0, confirmed: 0 };

  const ids = [...new Set(candidates.rows.map((row) => String(row.external_product_id)).filter(Boolean))];
  const transport = new SymphonyaHttpTransport({
    apiKey: symphonyaApiKey(),
    baseUrl: process.env.SYMPHONYA_API_BASE_URL,
    requestTimeoutMs: timeoutMs()
  });
  await transport.confirmPriceChanges({ productIds: ids });

  const offerIds = candidates.rows.map((row) => String(row.offer_id));
  const updated = await pool.query<SqlRow>(`
    UPDATE public.dropship_supplier_offers dso
       SET supplier_cost_minor=(dso.availability_payload->>'pendingSupplierCostMinor')::bigint,
           active=COALESCE((dso.availability_payload->>'activeBeforePriceHold')::boolean,false),
           cached_available=false,
           cached_quantity=NULL,
           availability_checked_at=NULL,
           availability_expires_at=NULL,
           availability_payload=(COALESCE(dso.availability_payload,'{}'::jsonb)
             - 'priceHeld'
             - 'priceHoldSource'
             - 'activeBeforePriceHold'
             - 'oldSupplierCostMinor'
             - 'pendingSupplierCostMinor'
             - 'pendingSupplierCurrency'
             - 'priceAlertObservedAt'
             - 'priceAlertPayload'
             - 'pricingSafeForSupplierConfirm')
             || jsonb_build_object('priceChangeConfirmedAt',now(),'requiresStockRevalidation',true),
           updated_at=now()
     WHERE dso.id = ANY($1::uuid[])
    RETURNING dso.id
  `, [offerIds]);
  return { candidates: candidates.rows.length, confirmed: updated.rowCount ?? updated.rows.length };
}

async function releaseLease(sourceId: string, error: string): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(
             COALESCE(metadata,'{}'::jsonb),
             '{symphonyaPriceAlerts}',
             (COALESCE(metadata->'symphonyaPriceAlerts','{}'::jsonb)-'leaseUntil')
               || jsonb_build_object('lastError',$2::text,'lastFailedAt',now()),
             true
           ),
           updated_at=now()
     WHERE id=$1::uuid
  `, [sourceId, error]);
}

function symphonyaApiKey(): string {
  const value = process.env.SYMPHONYA_API_KEY?.trim();
  if (!value) throw new Error("SYMPHONYA_API_KEY is required for Symphonya price alerts");
  return value;
}

function timeoutMs(): number {
  const value = Number(process.env.SYMPHONYA_REQUEST_TIMEOUT_MS ?? 20_000);
  return Number.isSafeInteger(value) && value > 0 ? value : 20_000;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}

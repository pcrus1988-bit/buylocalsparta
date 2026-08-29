import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

type StockFreshnessRow = SqlRow & {
  offer_id: string;
  title: string;
  offer_status: string;
  merchant_visible: boolean;
  merchant_pause_active: boolean;
  available_to_sell: number | string;
  stock_confirmed_at?: Date | string | null;
  freshness_ttl_seconds: number | string;
  fresh: boolean;
};

export type VendorStockFreshnessItem = Readonly<{
  offerId: string;
  title: string;
  offerStatus: string;
  merchantVisible: boolean;
  merchantPauseActive: boolean;
  availableToSell: number;
  stockConfirmedAt?: number;
  freshnessTtlSeconds: number;
  fresh: boolean;
}>;

export type VendorStockFreshnessSnapshot = Readonly<{
  available: boolean;
  freshCount: number;
  staleCount: number;
  staleSellableCount: number;
  items: readonly VendorStockFreshnessItem[];
}>;

const unavailable = (): VendorStockFreshnessSnapshot => ({ available: false, freshCount: 0, staleCount: 0, staleSellableCount: 0, items: [] });

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function optionalEpoch(value: unknown): number | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getVendorStockFreshness(principal: SessionPrincipal): Promise<VendorStockFreshnessSnapshot> {
  if (!postgresVendorRuntimeEnabled()) return unavailable();

  try {
    const vendorId = requiredVendorId(principal);
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });

    return await uow.withTransaction({ actorUserId: principal.userId, vendorId, marketId: "sparta" }, async (tx) => {
      const result = await tx.query<StockFreshnessRow>(`
        SELECT vo.public_id AS offer_id,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
               vo.status::text AS offer_status,
               vo.merchant_visible,
               vo.merchant_pause_active,
               GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::integer AS available_to_sell,
               ib.stock_confirmed_at,
               ib.freshness_ttl_seconds,
               COALESCE(ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > now(),false) AS fresh
        FROM vendor_offers vo
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
          AND (vo.status='approved' OR vo.merchant_pause_active=true OR vo.status IN ('archived','suppressed'))
        ORDER BY fresh ASC,available_to_sell DESC,title,vo.public_id
      `, [vendorId]);

      const items = result.rows.map((row): VendorStockFreshnessItem => ({
        offerId: String(row.offer_id),
        title: String(row.title),
        offerStatus: String(row.offer_status),
        merchantVisible: Boolean(row.merchant_visible),
        merchantPauseActive: Boolean(row.merchant_pause_active),
        availableToSell: count(row.available_to_sell),
        stockConfirmedAt: optionalEpoch(row.stock_confirmed_at),
        freshnessTtlSeconds: count(row.freshness_ttl_seconds),
        fresh: Boolean(row.fresh)
      }));

      return {
        available: true,
        freshCount: items.filter((item) => item.fresh).length,
        staleCount: items.filter((item) => !item.fresh).length,
        staleSellableCount: items.filter((item) => !item.fresh && item.availableToSell > 0).length,
        items
      };
    }, { readOnly: true });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "vendor.stock_freshness_projection_failed",
      vendorId: principal.vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return unavailable();
  }
}

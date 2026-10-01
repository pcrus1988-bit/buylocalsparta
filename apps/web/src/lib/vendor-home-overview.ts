import {
  PostgresUnitOfWork,
  formatMoney,
  money,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const integer = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

function vendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function transientDatabaseFailure(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = errorMessage(error);
  return code === "57014"
    || /statement timeout|timeout exceeded|timed out|connect|connection terminated|ECONNRESET|ETIMEDOUT|remaining connection slots/i.test(message);
}

function degradedOverview(publicVendorId: string, vendorName = "Το κατάστημά σου", adviser = "ΚΟΝΤΑ ΜΟΥ") {
  return {
    vendor: {
      id: publicVendorId,
      name: vendorName,
      adviser
    },
    metrics: {
      ordersRequiringAction: 0,
      activeProducts: 0,
      availableUnits: 0,
      lowStockProducts: 0
    },
    performance: {
      purchases: 0,
      revenueMinor: 0
    },
    orderNotifications: {
      requiringAction: 0,
      breached: 0
    },
    finance: {
      supplierValueSnapshot: "—",
      note: "Τα ζωντανά οικονομικά στοιχεία ανανεώνονται προσωρινά. Οι λειτουργίες του χώρου συνεργάτη παραμένουν διαθέσιμες."
    },
    degraded: true as const
  };
}

/**
 * Purpose-built read model for the vendor landing page.
 *
 * Identity and counters are deliberately loaded in separate short transactions.
 * The dashboard must remain available even when a non-critical aggregate is slow:
 * a transient database timeout degrades the counters instead of crashing /vendor.
 *
 * The metrics query also aggregates each source once rather than repeating scans
 * through correlated subqueries. This matters for large supplier catalogues and
 * keeps the route compatible with the single-connection Vercel pool.
 */
export async function vendorHomeOverview(principal: SessionPrincipal) {
  const publicVendorId = vendorId(principal);
  const runtime = getProductionPostgresRuntime();
  const context = { actorUserId: principal.userId, vendorId: publicVendorId, marketId: "sparta" };

  let identity: Readonly<{ internalId: string; publicId: string; name: string; adviser: string }>;
  try {
    const identityUow = new PostgresUnitOfWork(runtime.sqlPool, {
      statementTimeoutMs: 2_500,
      lockTimeoutMs: 1_000
    });
    identity = await identityUow.withTransaction(context, async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT vb.id::text AS internal_vendor_id,
               vb.public_id,
               COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id) AS vendor_name,
               COALESCE((
                 SELECT ap.display_name
                 FROM adviser_profiles ap
                 JOIN vendor_users vu ON vu.id=ap.vendor_user_id
                 WHERE vu.vendor_id=vb.id AND ap.active=true
                 ORDER BY ap.created_at
                 LIMIT 1
               ),COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id)) AS adviser
        FROM vendor_businesses vb
        WHERE vb.public_id=$1
        LIMIT 1
      `, [publicVendorId]);

      if (!result.rowCount) throw new Error("Vendor profile not found");
      const row = result.rows[0];
      return {
        internalId: String(row.internal_vendor_id),
        publicId: String(row.public_id),
        name: String(row.vendor_name),
        adviser: String(row.adviser)
      };
    }, { readOnly: true });
  } catch (error) {
    if (!transientDatabaseFailure(error)) throw error;
    console.warn(JSON.stringify({
      level: "warn",
      event: "vendor.home.identity_degraded",
      vendorId: publicVendorId,
      message: errorMessage(error)
    }));
    return degradedOverview(publicVendorId);
  }

  try {
    const metricsUow = new PostgresUnitOfWork(runtime.sqlPool, {
      statementTimeoutMs: 3_000,
      lockTimeoutMs: 1_000
    });
    const metrics = await metricsUow.withTransaction(context, async (tx) => {
      const result = await tx.query<SqlRow>(`
        WITH inventory_metrics AS (
          SELECT
            COALESCE(SUM(GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)),0)::bigint AS available_units,
            COUNT(*) FILTER (
              WHERE GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>0
                AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)<=GREATEST(2,ib.safety_stock)
            )::bigint AS low_stock_products
          FROM inventory_balances ib
          JOIN vendor_offers vo ON vo.id=ib.offer_id
          WHERE vo.vendor_id=$1::uuid
            AND vo.status='approved'
        ),
        analytics_metrics AS (
          SELECT
            COUNT(*) FILTER (
              WHERE pae.event_type='purchase'
                AND pae.occurred_at>=now()-interval '30 days'
            )::bigint AS purchases_30d,
            COALESCE(SUM(pae.amount_minor) FILTER (
              WHERE pae.event_type='purchase'
                AND pae.occurred_at>=now()-interval '30 days'
            ),0)::bigint AS revenue_minor_30d
          FROM product_analytics_events pae
          WHERE pae.vendor_id=$1::uuid
            AND pae.occurred_at>=now()-interval '30 days'
        ),
        sla_metrics AS (
          SELECT
            COUNT(*) FILTER (WHERE c.state<>'resolved')::bigint AS sla_requiring_action,
            COUNT(*) FILTER (WHERE c.state='breached')::bigint AS sla_breached
          FROM fulfilment_sla_cases c
          WHERE c.vendor_id=$1::uuid
        )
        SELECT
          COALESCE((
            SELECT sva.canonical_count
            FROM storefront_vendor_assortment_read_model sva
            WHERE sva.vendor_id=$1::uuid
            LIMIT 1
          ),0)::bigint AS active_products,
          (SELECT available_units FROM inventory_metrics)::bigint AS available_units,
          (SELECT low_stock_products FROM inventory_metrics)::bigint AS low_stock_products,
          COALESCE((
            SELECT COUNT(*)
            FROM fulfilment_orders fo
            WHERE fo.vendor_id=$1::uuid
              AND fo.status IN ('awaiting_acceptance','accepted','picking','packed')
          ),0)::bigint AS orders_requiring_action,
          COALESCE((
            SELECT SUM(ol.supplier_unit_price_minor*ol.quantity)
            FROM order_lines ol
            WHERE ol.vendor_id=$1::uuid
              AND ol.status<>'cancelled'
          ),0)::bigint AS supplier_value_minor,
          (SELECT purchases_30d FROM analytics_metrics)::bigint AS purchases_30d,
          (SELECT revenue_minor_30d FROM analytics_metrics)::bigint AS revenue_minor_30d,
          (SELECT sla_requiring_action FROM sla_metrics)::bigint AS sla_requiring_action,
          (SELECT sla_breached FROM sla_metrics)::bigint AS sla_breached
      `, [identity.internalId]);

      return result.rows[0] ?? {};
    }, { readOnly: true });

    const supplierValueMinor = integer(metrics.supplier_value_minor);
    return {
      vendor: {
        id: identity.publicId,
        name: identity.name,
        adviser: identity.adviser
      },
      metrics: {
        ordersRequiringAction: integer(metrics.orders_requiring_action),
        activeProducts: integer(metrics.active_products),
        availableUnits: integer(metrics.available_units),
        lowStockProducts: integer(metrics.low_stock_products)
      },
      performance: {
        purchases: integer(metrics.purchases_30d),
        revenueMinor: integer(metrics.revenue_minor_30d)
      },
      orderNotifications: {
        requiringAction: integer(metrics.sla_requiring_action),
        breached: integer(metrics.sla_breached)
      },
      finance: {
        supplierValueSnapshot: formatMoney(money(supplierValueMinor, "EUR")),
        note: "Operational supplier-value snapshot only. Supplier invoices, platform fees, settlement approval and payout remain governed by the finance workflow."
      },
      degraded: false as const
    };
  } catch (error) {
    if (!transientDatabaseFailure(error)) throw error;
    console.warn(JSON.stringify({
      level: "warn",
      event: "vendor.home.metrics_degraded",
      vendorId: publicVendorId,
      message: errorMessage(error)
    }));
    return degradedOverview(publicVendorId, identity.name, identity.adviser);
  }
}

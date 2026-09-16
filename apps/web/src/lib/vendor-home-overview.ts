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

/**
 * Purpose-built read model for the vendor landing page.
 *
 * The landing page must remain a summary surface. In particular, it must not materialize the
 * full vendor catalogue, analytics product/filter option sets, or notification workspaces just
 * to render a handful of counters. Large dropshipping vendors can own tens of thousands of
 * offers, so those detailed workspaces belong on their dedicated routes.
 */
export async function vendorHomeOverview(principal: SessionPrincipal) {
  const publicVendorId = vendorId(principal);
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, {
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 2_000
  });

  return uow.withTransaction({ actorUserId: principal.userId, vendorId: publicVendorId, marketId: "sparta" }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      WITH target_vendor AS (
        SELECT vb.id,
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
      )
      SELECT tv.public_id AS vendor_id,
             tv.vendor_name,
             tv.adviser,
             COALESCE((
               SELECT sva.canonical_count
               FROM storefront_vendor_assortment_read_model sva
               WHERE sva.vendor_id=tv.id
               LIMIT 1
             ),0)::bigint AS active_products,
             COALESCE((
               SELECT SUM(GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked))
               FROM inventory_balances ib
               JOIN vendor_offers vo ON vo.id=ib.offer_id
               WHERE vo.vendor_id=tv.id AND vo.status='approved'
             ),0)::bigint AS available_units,
             COALESCE((
               SELECT COUNT(*)
               FROM inventory_balances ib
               JOIN vendor_offers vo ON vo.id=ib.offer_id
               WHERE vo.vendor_id=tv.id
                 AND vo.status='approved'
                 AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>0
                 AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)<=GREATEST(2,ib.safety_stock)
             ),0)::bigint AS low_stock_products,
             COALESCE((
               SELECT COUNT(*)
               FROM fulfilment_orders fo
               WHERE fo.vendor_id=tv.id AND fo.status IN ('awaiting_acceptance','accepted','picking','packed')
             ),0)::bigint AS orders_requiring_action,
             COALESCE((
               SELECT SUM(ol.supplier_unit_price_minor*ol.quantity)
               FROM order_lines ol
               WHERE ol.vendor_id=tv.id AND ol.status<>'cancelled'
             ),0)::bigint AS supplier_value_minor,
             COALESCE((
               SELECT COUNT(*)
               FROM product_analytics_events pae
               WHERE pae.vendor_id=tv.id
                 AND pae.event_type='purchase'
                 AND pae.occurred_at>=now()-interval '30 days'
             ),0)::bigint AS purchases_30d,
             COALESCE((
               SELECT SUM(pae.amount_minor)
               FROM product_analytics_events pae
               WHERE pae.vendor_id=tv.id
                 AND pae.event_type='purchase'
                 AND pae.occurred_at>=now()-interval '30 days'
             ),0)::bigint AS revenue_minor_30d,
             COALESCE((
               SELECT COUNT(*)
               FROM fulfilment_sla_cases c
               WHERE c.vendor_id=tv.id AND c.state<>'resolved'
             ),0)::bigint AS sla_requiring_action,
             COALESCE((
               SELECT COUNT(*)
               FROM fulfilment_sla_cases c
               WHERE c.vendor_id=tv.id AND c.state='breached'
             ),0)::bigint AS sla_breached
      FROM target_vendor tv
    `, [publicVendorId]);

    if (!result.rowCount) throw new Error("Vendor profile not found");
    const row = result.rows[0];
    const supplierValueMinor = integer(row.supplier_value_minor);

    return {
      vendor: {
        id: String(row.vendor_id),
        name: String(row.vendor_name),
        adviser: String(row.adviser)
      },
      metrics: {
        ordersRequiringAction: integer(row.orders_requiring_action),
        activeProducts: integer(row.active_products),
        availableUnits: integer(row.available_units),
        lowStockProducts: integer(row.low_stock_products)
      },
      performance: {
        purchases: integer(row.purchases_30d),
        revenueMinor: integer(row.revenue_minor_30d)
      },
      orderNotifications: {
        requiringAction: integer(row.sla_requiring_action),
        breached: integer(row.sla_breached)
      },
      finance: {
        supplierValueSnapshot: formatMoney(money(supplierValueMinor, "EUR")),
        note: "Operational supplier-value snapshot only. Supplier invoices, platform fees, settlement approval and payout remain governed by the finance workflow."
      }
    };
  }, { readOnly: true });
}

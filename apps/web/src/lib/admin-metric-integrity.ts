import {
  PostgresUnitOfWork,
  formatMoney,
  money,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AdminMetricIntegritySignal = Readonly<{
  id: string;
  state: "healthy" | "warning" | "critical" | "unavailable";
  label: string;
  detail: string;
  source: string;
}>;

export type AdminMetricSource = Readonly<{
  key: string;
  label: string;
  state: "live" | "partial" | "unavailable";
  rows: number;
  lastSeen?: number;
  detail: string;
}>;

export type AdminMetricIntegritySnapshot = Readonly<{
  generatedAt: number;
  period: "30d";
  vendorLifecycle: Readonly<{
    total: number;
    active: number;
    invited: number;
    applicationStarted: number;
    other: number;
    activationRate?: number;
  }>;
  commerce: Readonly<{
    validPaidOrders: number;
    merchandiseGmvMinor: number;
    merchandiseGmv: string;
    shippingMinor: number;
    capturedPayments: number;
    capturedMinor: number;
    captured: string;
    cancelledCapturedOrders: number;
    failedOrManualRefunds: number;
    failedOrManualRefundMinor: number;
    attributedOrders: number;
    attributedRevenueMinor: number;
  }>;
  legacy: Readonly<{
    checkoutAuthorisedOrders: number;
    checkoutAuthorisedValueMinor: number;
    productImpressions: number;
    adviceStarted: number;
    adviceRequested: number;
    counterofferAccepted: number;
    counterofferConverted: number;
  }>;
  sources: readonly AdminMetricSource[];
  signals: readonly AdminMetricIntegritySignal[];
}>;

function safeInteger(value: unknown, field: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid metric integer: ${field}`);
  return parsed;
}

function optionalEpoch(value: unknown): number | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sourceState(rows: number, lastSeen: number | undefined, generatedAt: number, partial = false): AdminMetricSource["state"] {
  if (rows <= 0) return "unavailable";
  if (partial) return "partial";
  if (lastSeen !== undefined && generatedAt - lastSeen > 7 * DAY_MS) return "partial";
  return "live";
}

export async function adminMetricIntegritySnapshot(principal: SessionPrincipal): Promise<AdminMetricIntegritySnapshot> {
  assertAdminPermission(principal, "analytics.market.read");
  if (!productionDatabaseConfigured()) throw new Error("Metric integrity requires the production database");

  const generatedAt = Date.now();
  const from = new Date(generatedAt - 30 * DAY_MS);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [vendorRows, commerceRows, attributedRows, legacyRows, sourceRows] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT status::text AS status,count(*)::bigint AS n
        FROM vendor_businesses
        WHERE market_id=(SELECT id FROM markets WHERE code='sparta')
        GROUP BY status::text
      `),
      tx.query<SqlRow>(`
        WITH paid_orders AS (
          SELECT co.id,co.status::text AS status,co.subtotal_minor,co.shipping_minor
          FROM customer_orders co
          WHERE co.market_id=(SELECT id FROM markets WHERE code='sparta')
            AND co.created_at >= $1
            AND EXISTS (
              SELECT 1 FROM payments p
              WHERE p.order_id=co.id AND COALESCE(p.captured_minor,0)>0
            )
        ), payment_rollup AS (
          SELECT count(*)::bigint AS captured_payments,
                 COALESCE(sum(p.captured_minor),0)::bigint AS captured_minor
          FROM payments p
          JOIN customer_orders co ON co.id=p.order_id
          WHERE co.market_id=(SELECT id FROM markets WHERE code='sparta')
            AND p.created_at >= $1
            AND COALESCE(p.captured_minor,0)>0
        ), refund_rollup AS (
          SELECT count(*)::bigint AS failed_or_manual_refunds,
                 COALESCE(sum(r.amount_minor),0)::bigint AS failed_or_manual_refund_minor
          FROM refunds r
          JOIN customer_orders co ON co.id=r.order_id
          WHERE co.market_id=(SELECT id FROM markets WHERE code='sparta')
            AND r.created_at >= $1
            AND r.status::text IN ('failed','manual_review')
        )
        SELECT
          count(*) FILTER (WHERE po.status <> 'cancelled')::bigint AS valid_paid_orders,
          COALESCE(sum(po.subtotal_minor) FILTER (WHERE po.status <> 'cancelled'),0)::bigint AS merchandise_gmv_minor,
          COALESCE(sum(po.shipping_minor) FILTER (WHERE po.status <> 'cancelled'),0)::bigint AS shipping_minor,
          count(*) FILTER (WHERE po.status='cancelled')::bigint AS cancelled_captured_orders,
          pr.captured_payments,pr.captured_minor,rr.failed_or_manual_refunds,rr.failed_or_manual_refund_minor
        FROM paid_orders po
        CROSS JOIN payment_rollup pr
        CROSS JOIN refund_rollup rr
        GROUP BY pr.captured_payments,pr.captured_minor,rr.failed_or_manual_refunds,rr.failed_or_manual_refund_minor
      `, [from]),
      tx.query<SqlRow>(`
        SELECT count(DISTINCT order_id)::bigint AS attributed_orders,
               COALESCE(sum(amount_minor),0)::bigint AS attributed_revenue_minor
        FROM product_analytics_events
        WHERE event_type='purchase' AND occurred_at >= $1
      `, [from]),
      tx.query<SqlRow>(`
        SELECT
          count(*) FILTER (WHERE event_name='checkout.authorised')::bigint AS checkout_authorised_orders,
          COALESCE(sum(value_minor) FILTER (WHERE event_name='checkout.authorised'),0)::bigint AS checkout_authorised_value_minor,
          count(*) FILTER (WHERE event_name='product.impression')::bigint AS product_impressions,
          count(*) FILTER (WHERE event_name='advice.started')::bigint AS advice_started,
          count(*) FILTER (WHERE event_name='advice.requested')::bigint AS advice_requested,
          count(*) FILTER (WHERE event_name='counteroffer.accepted')::bigint AS counteroffer_accepted,
          count(*) FILTER (WHERE event_name='counteroffer.converted')::bigint AS counteroffer_converted
        FROM analytics_events
        WHERE market_id=(SELECT id FROM markets WHERE code='sparta') AND occurred_at >= $1
      `, [from]),
      tx.query<SqlRow>(`
        SELECT
          (SELECT count(*) FROM analytics_events WHERE market_id=(SELECT id FROM markets WHERE code='sparta') AND occurred_at >= $1)::bigint AS analytics_rows,
          (SELECT max(occurred_at) FROM analytics_events WHERE market_id=(SELECT id FROM markets WHERE code='sparta')) AS analytics_last,
          (SELECT count(*) FROM product_analytics_events WHERE occurred_at >= $1)::bigint AS product_rows,
          (SELECT max(occurred_at) FROM product_analytics_events) AS product_last,
          (SELECT count(*) FROM fairness_assignment_events WHERE market_id=(SELECT id FROM markets WHERE code='sparta') AND created_at >= $1)::bigint AS fairness_rows,
          (SELECT max(created_at) FROM fairness_assignment_events WHERE market_id=(SELECT id FROM markets WHERE code='sparta')) AS fairness_last,
          (SELECT COALESCE(sum(searches),0) FROM analytics_search_terms_daily WHERE market_id=(SELECT id FROM markets WHERE code='sparta') AND day >= $2::date)::bigint AS search_rows,
          (SELECT max(day)::text FROM analytics_search_terms_daily WHERE market_id=(SELECT id FROM markets WHERE code='sparta')) AS search_last_day,
          (SELECT count(*) FROM analytics_market_daily WHERE market_id=(SELECT id FROM markets WHERE code='sparta'))::bigint AS market_daily_rows,
          (SELECT count(*) FROM analytics_vendor_daily WHERE market_id=(SELECT id FROM markets WHERE code='sparta'))::bigint AS vendor_daily_rows
      `, [from, from.toISOString().slice(0, 10)])
    ]);

    const statuses = new Map(vendorRows.rows.map((row) => [String(row.status ?? ""), safeInteger(row.n, "vendor.status.count")]));
    const total = [...statuses.values()].reduce((sum, value) => sum + value, 0);
    const active = statuses.get("active") ?? 0;
    const invited = statuses.get("invited") ?? 0;
    const applicationStarted = statuses.get("application_started") ?? 0;
    const other = Math.max(0, total - active - invited - applicationStarted);

    const commerceRow = commerceRows.rows[0] ?? {};
    const attributedRow = attributedRows.rows[0] ?? {};
    const legacyRow = legacyRows.rows[0] ?? {};
    const sourceRow = sourceRows.rows[0] ?? {};

    const validPaidOrders = safeInteger(commerceRow.valid_paid_orders, "commerce.valid_paid_orders");
    const merchandiseGmvMinor = safeInteger(commerceRow.merchandise_gmv_minor, "commerce.merchandise_gmv_minor");
    const shippingMinor = safeInteger(commerceRow.shipping_minor, "commerce.shipping_minor");
    const capturedPayments = safeInteger(commerceRow.captured_payments, "commerce.captured_payments");
    const capturedMinor = safeInteger(commerceRow.captured_minor, "commerce.captured_minor");
    const cancelledCapturedOrders = safeInteger(commerceRow.cancelled_captured_orders, "commerce.cancelled_captured_orders");
    const failedOrManualRefunds = safeInteger(commerceRow.failed_or_manual_refunds, "commerce.failed_or_manual_refunds");
    const failedOrManualRefundMinor = safeInteger(commerceRow.failed_or_manual_refund_minor, "commerce.failed_or_manual_refund_minor");
    const attributedOrders = safeInteger(attributedRow.attributed_orders, "analytics.attributed_orders");
    const attributedRevenueMinor = safeInteger(attributedRow.attributed_revenue_minor, "analytics.attributed_revenue_minor");

    const checkoutAuthorisedOrders = safeInteger(legacyRow.checkout_authorised_orders, "legacy.checkout_authorised_orders");
    const checkoutAuthorisedValueMinor = safeInteger(legacyRow.checkout_authorised_value_minor, "legacy.checkout_authorised_value_minor");
    const productImpressions = safeInteger(legacyRow.product_impressions, "legacy.product_impressions");
    const adviceStarted = safeInteger(legacyRow.advice_started, "legacy.advice_started");
    const adviceRequested = safeInteger(legacyRow.advice_requested, "legacy.advice_requested");
    const counterofferAccepted = safeInteger(legacyRow.counteroffer_accepted, "legacy.counteroffer_accepted");
    const counterofferConverted = safeInteger(legacyRow.counteroffer_converted, "legacy.counteroffer_converted");

    const analyticsRows = safeInteger(sourceRow.analytics_rows, "source.analytics_rows");
    const productRowsCount = safeInteger(sourceRow.product_rows, "source.product_rows");
    const fairnessRows = safeInteger(sourceRow.fairness_rows, "source.fairness_rows");
    const searchRows = safeInteger(sourceRow.search_rows, "source.search_rows");
    const marketDailyRows = safeInteger(sourceRow.market_daily_rows, "source.market_daily_rows");
    const vendorDailyRows = safeInteger(sourceRow.vendor_daily_rows, "source.vendor_daily_rows");
    const analyticsLast = optionalEpoch(sourceRow.analytics_last);
    const productLast = optionalEpoch(sourceRow.product_last);
    const fairnessLast = optionalEpoch(sourceRow.fairness_last);
    const searchLast = typeof sourceRow.search_last_day === "string" ? optionalEpoch(`${sourceRow.search_last_day}T23:59:59.999Z`) : undefined;

    const sources: AdminMetricSource[] = [
      { key: "transactions", label: "Order & payment ledger", state: "live", rows: capturedPayments, detail: "Financial commerce authority. Valid paid orders include captured non-cancelled orders even if they later become refunded/disputed; refunds remain separately visible." },
      { key: "product_funnel", label: "Product funnel", state: sourceState(productRowsCount, productLast, generatedAt), rows: productRowsCount, lastSeen: productLast, detail: "Database-triggered page/cart/checkout/purchase attribution with idempotency." },
      { key: "fairness", label: "Fairness assignments", state: sourceState(fairnessRows, fairnessLast, generatedAt), rows: fairnessRows, lastSeen: fairnessLast, detail: "Authoritative product-impression assignment stream." },
      { key: "search", label: "Search demand", state: sourceState(searchRows, searchLast, generatedAt), rows: searchRows, lastSeen: searchLast, detail: "Daily search-demand aggregation." },
      { key: "legacy", label: "Legacy market events", state: sourceState(analyticsRows, analyticsLast, generatedAt, true), rows: analyticsRows, lastSeen: analyticsLast, detail: "Still receives selected events, but lifecycle vocabulary is incomplete; never use alone as financial authority." },
      { key: "daily_rollups", label: "Legacy daily rollups", state: marketDailyRows + vendorDailyRows > 0 ? "partial" : "unavailable", rows: marketDailyRows + vendorDailyRows, detail: "Build 0.12 market/vendor daily aggregate tables. Empty tables are treated as unavailable, not zero activity." }
    ];

    const signals: AdminMetricIntegritySignal[] = [];
    signals.push(validPaidOrders === attributedOrders
      ? { id: "commerce-attribution", state: "healthy", label: "Commerce ↔ attribution", detail: `${validPaidOrders} valid paid order${validPaidOrders === 1 ? "" : "s"} match ${attributedOrders} attributed purchase order${attributedOrders === 1 ? "" : "s"}.`, source: "Orders + product analytics" }
      : { id: "commerce-attribution", state: "critical", label: "Commerce ↔ attribution", detail: `${validPaidOrders} valid paid orders versus ${attributedOrders} attributed purchase orders. Investigate before trusting conversion/forecast output.`, source: "Orders + product analytics" });

    signals.push(checkoutAuthorisedOrders === validPaidOrders
      ? { id: "legacy-checkout", state: "healthy", label: "Legacy checkout contract", detail: "Legacy checkout authorisation events currently align with valid paid orders.", source: "analytics_events" }
      : { id: "legacy-checkout", state: "warning", label: "Legacy checkout contract", detail: `Legacy analytics reports ${checkoutAuthorisedOrders} checkout.authorised events while the transactional ledger has ${validPaidOrders} valid paid orders. Financial KPIs are therefore sourced from the ledger/product funnel instead.`, source: "analytics_events vs orders" });

    if (counterofferConverted > 0 && counterofferAccepted === 0) {
      signals.push({ id: "counteroffer-vocabulary", state: "warning", label: "Counteroffer event vocabulary", detail: `Production emits counteroffer.converted (${counterofferConverted}) while the older Admin contract expects counteroffer.accepted (${counterofferAccepted}).`, source: "analytics_events" });
    }

    signals.push(cancelledCapturedOrders > 0 || failedOrManualRefunds > 0
      ? { id: "refund-control", state: "critical", label: "Captured cancellation / refund control", detail: `${cancelledCapturedOrders} cancelled order${cancelledCapturedOrders === 1 ? " has" : "s have"} captured funds; ${failedOrManualRefunds} refund${failedOrManualRefunds === 1 ? " is" : "s are"} failed or in manual review (${formatMoney(money(failedOrManualRefundMinor))}).`, source: "Payments + refunds" }
      : { id: "refund-control", state: "healthy", label: "Captured cancellation / refund control", detail: "No cancelled captured order or failed/manual-review refund is present in the last 30 days.", source: "Payments + refunds" });

    signals.push(marketDailyRows + vendorDailyRows > 0
      ? { id: "daily-rollups", state: "warning", label: "Legacy daily rollups", detail: `${marketDailyRows} market and ${vendorDailyRows} vendor daily aggregate rows exist, but they remain legacy sources.`, source: "analytics_market_daily + analytics_vendor_daily" }
      : { id: "daily-rollups", state: "unavailable", label: "Legacy daily rollups", detail: "Market/vendor daily aggregate tables are empty. Dashboards must not interpret them as zero business activity.", source: "analytics_market_daily + analytics_vendor_daily" });

    signals.push({ id: "vendor-target", state: "unavailable", label: "Vendor readiness target", detail: `${active} active · ${applicationStarted} application-started · ${invited} invited · ${other} other, across ${total} Sparta vendor records. No launch target is configured, so this pipeline is not converted into a readiness percentage.`, source: "vendor_businesses" });

    return {
      generatedAt,
      period: "30d",
      vendorLifecycle: {
        total,
        active,
        invited,
        applicationStarted,
        other,
        activationRate: total > 0 ? active / total : undefined
      },
      commerce: {
        validPaidOrders,
        merchandiseGmvMinor,
        merchandiseGmv: formatMoney(money(merchandiseGmvMinor)),
        shippingMinor,
        capturedPayments,
        capturedMinor,
        captured: formatMoney(money(capturedMinor)),
        cancelledCapturedOrders,
        failedOrManualRefunds,
        failedOrManualRefundMinor,
        attributedOrders,
        attributedRevenueMinor
      },
      legacy: {
        checkoutAuthorisedOrders,
        checkoutAuthorisedValueMinor,
        productImpressions,
        adviceStarted,
        adviceRequested,
        counterofferAccepted,
        counterofferConverted
      },
      sources,
      signals
    };
  }, { readOnly: true });
}

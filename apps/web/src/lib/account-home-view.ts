import {
  CustomerRecommendationService,
  defaultCustomerRetentionSnapshot,
  formatMoney,
  money,
  type CustomerOrder,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import { customerOrders } from "./customer-commerce-runtime";
import { customerStateSnapshot } from "./customer-state-runtime";
import { marketplaceReferenceMap } from "./public-reference-service";
import { customerOrderLineActionToken } from "./customer-order-line-action-token";
import {
  customerBrowserNotification,
  customerBrowserPreferences,
  customerBrowserPrivacyRequest,
  customerBrowserRecentlyViewed,
  customerBrowserSavedProductAlert,
  customerBrowserSavedSearch
} from "./customer-account-browser-view";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { isPublicCatalogueTitle } from "./public-data-integrity";

type AccountCatalogRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  department_code: string | null;
  min_price_minor: number | string | null;
  available: boolean;
  is_seed: boolean;
}>;

type AccountCatalogProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  categoryCode: string;
  departmentCode?: string;
  priceMinor: number;
  price: string;
  available: boolean;
  seed: boolean;
}>;

function safeMinor(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

/**
 * The account landing page is a summary surface, not a storefront crawl.
 *
 * It used to load every public canonical and then perform an availability lookup for
 * every product just to render saved/recent/recommended cards. With a large dropship
 * catalogue that creates thousands of reads and can exhaust the small serverless DB
 * pool. This projection fetches only the user's saved/recent products plus a bounded
 * recommendation pool from the storefront read model.
 */
async function accountCatalogProjection(seedIds: readonly string[], recommendationsEnabled: boolean): Promise<readonly AccountCatalogProduct[]> {
  if (!productionDatabaseConfigured()) return [];
  const uniqueSeedIds = [...new Set(seedIds.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  const result = await getProductionPostgresRuntime().nativePool.query<AccountCatalogRow>(`
    WITH seed AS (
      SELECT rm.canonical_public_id,
             rm.slug,
             rm.title,
             rm.category_code,
             rm.department_code,
             rm.min_price_minor,
             ((rm.local_sellable=true AND rm.local_available_until>now())
               OR (rm.dropship_sellable=true AND rm.dropship_available_until>now())) AS available,
             true AS is_seed,
             rm.projected_at
      FROM public.storefront_catalog_read_model rm
      WHERE rm.canonical_public_id=ANY($1::text[])
    ), candidate AS (
      SELECT rm.canonical_public_id,
             rm.slug,
             rm.title,
             rm.category_code,
             rm.department_code,
             rm.min_price_minor,
             true AS available,
             false AS is_seed,
             rm.projected_at
      FROM public.storefront_catalog_read_model rm
      WHERE $2::boolean=true
        AND rm.min_price_minor>0
        AND ((rm.local_sellable=true AND rm.local_available_until>now())
          OR (rm.dropship_sellable=true AND rm.dropship_available_until>now()))
        AND NOT (rm.canonical_public_id=ANY($1::text[]))
        AND (
          NOT EXISTS (SELECT 1 FROM seed)
          OR rm.category_code IN (SELECT category_code FROM seed)
        )
      ORDER BY rm.projected_at DESC NULLS LAST,rm.canonical_public_id
      LIMIT 24
    )
    SELECT canonical_public_id,slug,title,category_code,department_code,min_price_minor,available,is_seed FROM seed
    UNION ALL
    SELECT canonical_public_id,slug,title,category_code,department_code,min_price_minor,available,is_seed FROM candidate
  `, [uniqueSeedIds, recommendationsEnabled]);

  return result.rows.flatMap((row) => {
    const title = String(row.title ?? "").trim();
    if (!title || !isPublicCatalogueTitle(title)) return [];
    const priceMinor = safeMinor(row.min_price_minor);
    return [{
      id: String(row.canonical_public_id),
      slug: String(row.slug),
      title,
      categoryCode: String(row.category_code),
      departmentCode: row.department_code ? String(row.department_code) : undefined,
      priceMinor,
      price: formatMoney(money(priceMinor)),
      available: Boolean(row.available),
      seed: Boolean(row.is_seed)
    }];
  });
}

export async function accountHomeDashboard(principal: SessionPrincipal, now = Date.now()) {
  const [state, ordersRaw] = await Promise.all([
    customerStateSnapshot(principal.userId, now),
    customerOrders(principal)
  ]);

  const seedIds = [
    ...state.savedProducts.map((item) => item.canonicalVariantId),
    ...state.recentlyViewed.map((item) => item.canonicalVariantId)
  ];
  const catalog = await accountCatalogProjection(seedIds, state.preferences.recommendationsEnabled);
  const catalogMap = new Map(catalog.map((product) => [product.id, product]));

  const savedProducts = state.savedProducts.map((saved) => {
    const product = catalogMap.get(saved.canonicalVariantId);
    const alert = state.savedProductAlerts.find((item) => item.canonicalVariantId === saved.canonicalVariantId);
    if (!product) return {
      canonicalVariantId: saved.canonicalVariantId,
      unavailable: true as const,
      alert: alert ? customerBrowserSavedProductAlert(alert) : null
    };
    return {
      canonicalVariantId: saved.canonicalVariantId,
      slug: product.slug,
      title: product.title,
      price: product.price,
      available: product.available,
      alert: alert ? customerBrowserSavedProductAlert(alert) : null
    };
  });

  const recentlyViewed = state.recentlyViewed.flatMap((view) => {
    const product = catalogMap.get(view.canonicalVariantId);
    return product ? [{ ...customerBrowserRecentlyViewed(view), slug: product.slug, title: product.title, price: product.price }] : [];
  });

  const recommendationSignals = (ids: readonly { canonicalVariantId: string; viewedAt?: number }[]) => ids.flatMap((item) => {
    const product = catalogMap.get(item.canonicalVariantId);
    return product ? [{ canonicalVariantId: product.id, categoryCode: product.categoryCode, viewedAt: item.viewedAt }] : [];
  });

  const recommendations = new CustomerRecommendationService().recommend({
    enabled: state.preferences.recommendationsEnabled,
    products: catalog.map((product) => ({
      canonicalVariantId: product.id,
      categoryCode: product.categoryCode,
      available: product.available,
      adviceAvailable: true
    })),
    saved: recommendationSignals(savedProducts),
    recentlyViewed: recommendationSignals(recentlyViewed),
    locale: "el",
    limit: 6
  }).flatMap((item) => {
    const product = catalogMap.get(item.canonicalVariantId);
    return product ? [{ ...item, slug: product.slug, title: product.title, price: product.price }] : [];
  });

  const orderReferences = await marketplaceReferenceMap("order", ordersRaw.map((order) => order.id));
  const orders = ordersRaw.map((order) => {
    const referenceNumber = orderReferences.get(order.id) ?? order.id;
    return {
      id: referenceNumber,
      referenceNumber,
      status: customerOrderStatusLabel(order),
      total: formatMoney(order.total),
      createdAt: order.createdAt,
      fulfilmentMode: order.fulfilmentMode,
      lines: order.lines.map((line) => ({
        id: customerOrderLineActionToken(principal.userId, order.id, line.id),
        title: line.titleSnapshot,
        quantity: line.quantity,
        status: line.status
      }))
    };
  });

  return {
    account: { email: principal.email },
    csrfToken: principal.csrfToken,
    savedProducts,
    savedSearches: state.savedSearches.map(customerBrowserSavedSearch),
    notifications: state.notifications.map(customerBrowserNotification),
    unreadNotifications: state.unreadNotifications,
    recentlyViewed,
    preferences: customerBrowserPreferences(state.preferences),
    recommendations,
    privacyRequests: state.privacyRequests.map(customerBrowserPrivacyRequest),
    retention: defaultCustomerRetentionSnapshot(now),
    orders
  };
}

function customerOrderStatusLabel(order: CustomerOrder): string {
  if (order.status === "cancelled") return "Ακυρωμένη";
  if (order.status === "refunded") return "Επιστράφηκαν τα χρήματα";
  if (order.status === "partially_refunded") return "Μερική επιστροφή χρημάτων";
  if (order.status === "pending_payment") return "Αναμονή πληρωμής";

  const fulfilments = order.fulfilments.filter((item) => item.status !== "rejected" && item.status !== "cancelled");
  if (fulfilments.length) {
    const statuses: string[] = fulfilments.map((item) => item.status);
    if (order.fulfilmentMode === "local_delivery") {
      if (statuses.every((status) => status === "delivered")) return "Ολοκληρώθηκε";
      if (statuses.some((status) => status === "handed_over")) {
        if (statuses.every((status) => ["handed_over", "delivered"].includes(status))) return "Καθ’ οδόν προς εσένα";
        return "Συλλογή από καταστήματα";
      }
      if (statuses.some((status) => status === "ready_for_handover")) return "Περιμένει παραλαβή από οδηγό";
      if (statuses.some((status) => ["accepted", "picking", "packed"].includes(status))) return "Ετοιμάζεται από το κατάστημα";
      if (statuses.some((status) => status === "awaiting_acceptance")) return "Αναμονή αποδοχής από το κατάστημα";
    } else if (order.fulfilmentMode === "pickup") {
      if (statuses.every((status) => ["handed_over", "delivered"].includes(status))) return "Παραλήφθηκε";
      if (statuses.some((status) => status === "ready_for_handover")) return "Έτοιμη για παραλαβή";
      if (statuses.some((status) => ["accepted", "picking", "packed"].includes(status))) return "Ετοιμάζεται από το κατάστημα";
      if (statuses.some((status) => status === "awaiting_acceptance")) return "Αναμονή αποδοχής από το κατάστημα";
    } else {
      if (statuses.every((status) => status === "delivered")) return "Ολοκληρώθηκε";
      if (statuses.some((status) => status === "shipped")) return "Σε αποστολή";
      if (statuses.some((status) => status === "handed_over")) return "Παραδόθηκε στον μεταφορέα";
      if (statuses.some((status) => status === "ready_for_handover")) return "Έτοιμη για αποστολή";
      if (statuses.some((status) => ["accepted", "picking", "packed"].includes(status))) return "Ετοιμάζεται από το κατάστημα";
      if (statuses.some((status) => status === "awaiting_acceptance")) return "Αναμονή αποδοχής από το κατάστημα";
    }
  }

  if (["fulfilled", "completed"].includes(order.status)) return "Ολοκληρώθηκε";
  if (order.status === "confirmed") return "Επιβεβαιωμένη";
  if (order.status === "requires_customer_action") return "Χρειάζεται ενέργεια";
  if (order.status === "partially_fulfilled") return "Μερικώς ολοκληρωμένη";
  return order.status.replaceAll("_", " ");
}

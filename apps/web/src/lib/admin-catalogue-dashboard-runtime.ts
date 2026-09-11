import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { getVendorOperationsRuntime } from "./vendor-operations-runtime";

export type CatalogueDashboardWorkspace = Readonly<{
  csrfToken: string;
  metrics: Readonly<{
    canonicalProducts: number;
    liveCanonicalProducts: number;
    activeOffers: number;
    vendorsRepresented: number;
    uncategorizedProducts: number;
    missingAttributeProducts: number;
    openExceptions: number;
    activeSources: number;
    crawlJobsInFlight: number;
    crawlFailures24h: number;
  }>;
}>;

function integer(row: SqlRow, field: string): number {
  const value = Number(row[field] ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Database field ${field} is not a non-negative safe integer`);
  }
  return value;
}

async function postgresCatalogueDashboard(
  principal: SessionPrincipal
): Promise<CatalogueDashboardWorkspace> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(
      `SELECT
         (SELECT COUNT(*)::int
            FROM canonical_variants cv
            JOIN markets m ON m.id = cv.market_id
           WHERE m.code = 'sparta') AS canonical_products,
         (SELECT COUNT(*)::int
            FROM canonical_variants cv
            JOIN markets m ON m.id = cv.market_id
           WHERE m.code = 'sparta'
             AND cv.active = TRUE
             AND cv.suppressed = FALSE
             AND cv.recalled = FALSE) AS live_canonical_products,
         (SELECT COUNT(*)::int
            FROM vendor_offers vo
            JOIN markets m ON m.id = vo.market_id
           WHERE m.code = 'sparta'
             AND vo.status::text <> 'archived'
             AND COALESCE(vo.merchant_visible, TRUE) = TRUE
             AND COALESCE(vo.merchant_pause_active, FALSE) = FALSE) AS active_offers,
         (SELECT COUNT(DISTINCT vo.vendor_id)::int
            FROM vendor_offers vo
            JOIN markets m ON m.id = vo.market_id
           WHERE m.code = 'sparta'
             AND vo.status::text <> 'archived') AS vendors_represented,
         (SELECT COUNT(*)::int
            FROM canonical_variants cv
            JOIN markets m ON m.id = cv.market_id
           WHERE m.code = 'sparta'
             AND cv.category_id IS NULL) AS uncategorized_products,
         (SELECT COUNT(*)::int
            FROM canonical_variants cv
            JOIN markets m ON m.id = cv.market_id
           WHERE m.code = 'sparta'
             AND COALESCE(jsonb_object_length(cv.variant_attributes), 0) = 0) AS missing_attribute_products,
         (SELECT COUNT(*)::int
            FROM catalog_canonicalization_reviews r
            JOIN markets m ON m.id = r.market_id
           WHERE m.code = 'sparta'
             AND r.status = 'open'
             AND r.reason_code IN ('canonical_identity_ambiguous', 'material_variant_conflict')) AS open_exceptions,
         (SELECT COUNT(*)::int
            FROM catalog_sources s
            JOIN markets m ON m.id = s.market_id
           WHERE m.code = 'sparta'
             AND s.active = TRUE) AS active_sources,
         (SELECT COUNT(*)::int
            FROM catalog_web_crawl_jobs j
            JOIN catalog_sources s ON s.id = j.source_id
            JOIN markets m ON m.id = s.market_id
           WHERE m.code = 'sparta'
             AND j.status NOT IN ('completed', 'failed', 'cancelled', 'canceled')) AS crawl_jobs_in_flight,
         (SELECT COUNT(*)::int
            FROM catalog_web_crawl_jobs j
            JOIN catalog_sources s ON s.id = j.source_id
            JOIN markets m ON m.id = s.market_id
           WHERE m.code = 'sparta'
             AND j.status = 'failed'
             AND j.updated_at >= NOW() - INTERVAL '24 hours') AS crawl_failures_24h`
    );

    const row = result.rows[0] ?? {};
    return {
      csrfToken: principal.csrfToken,
      metrics: {
        canonicalProducts: integer(row, "canonical_products"),
        liveCanonicalProducts: integer(row, "live_canonical_products"),
        activeOffers: integer(row, "active_offers"),
        vendorsRepresented: integer(row, "vendors_represented"),
        uncategorizedProducts: integer(row, "uncategorized_products"),
        missingAttributeProducts: integer(row, "missing_attribute_products"),
        openExceptions: integer(row, "open_exceptions"),
        activeSources: integer(row, "active_sources"),
        crawlJobsInFlight: integer(row, "crawl_jobs_in_flight"),
        crawlFailures24h: integer(row, "crawl_failures_24h")
      }
    };
  }, { readOnly: true });
}

function memoryCatalogueDashboard(principal: SessionPrincipal): CatalogueDashboardWorkspace {
  const canonicals = getVendorOperationsRuntime().catalog.canonicals({ marketId: "sparta" });
  return {
    csrfToken: principal.csrfToken,
    metrics: {
      canonicalProducts: canonicals.length,
      liveCanonicalProducts: canonicals.filter(
        (canonical) => canonical.active && !canonical.suppressed && !canonical.recalled
      ).length,
      activeOffers: 0,
      vendorsRepresented: 0,
      uncategorizedProducts: canonicals.filter((canonical) => !canonical.categoryCode).length,
      missingAttributeProducts: 0,
      openExceptions: 0,
      activeSources: 0,
      crawlJobsInFlight: 0,
      crawlFailures24h: 0
    }
  };
}

export async function adminCatalogueDashboardWorkspace(
  principal: SessionPrincipal
): Promise<CatalogueDashboardWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (postgresAdminRuntimeEnabled()) return postgresCatalogueDashboard(principal);
  return memoryCatalogueDashboard(principal);
}

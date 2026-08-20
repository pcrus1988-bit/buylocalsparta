import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { adminDashboard, hasAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

type AttentionMetrics = Readonly<{
  vendorVerificationQueue: number;
  catalogReviewQueue: number;
  pendingMedia: number;
  pendingCompliance: number;
  payableProcurements: number;
  fairnessAppeals: number;
}>;

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function postgresAttentionMetrics(principal: SessionPrincipal): Promise<AttentionMetrics> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT
      (SELECT count(*) FROM vendor_applications WHERE status IN ('verification_pending','restricted'))::bigint AS vendor_verification_queue,
      (SELECT count(*) FROM vendor_product_submissions WHERE status IN ('needs_review','linked'))::bigint AS catalog_review_queue,
      (SELECT count(*) FROM product_media WHERE scan_status='pending' OR rights_status='pending' OR moderation_status='pending')::bigint AS pending_media,
      (SELECT count(*) FROM product_compliance_documents WHERE status='pending')::bigint AS pending_compliance,
      (SELECT count(*) FROM procurements WHERE status='payable')::bigint AS payable_procurements,
      (SELECT count(*) FROM fairness_appeals WHERE status IN ('open','under_review'))::bigint AS fairness_appeals`);
    const row = result.rows[0] ?? {};
    return {
      vendorVerificationQueue: count(row.vendor_verification_queue),
      catalogReviewQueue: count(row.catalog_review_queue),
      pendingMedia: count(row.pending_media),
      pendingCompliance: count(row.pending_compliance),
      payableProcurements: count(row.payable_procurements),
      fairnessAppeals: count(row.fairness_appeals)
    };
  }, { readOnly: true });
}

async function attentionMetrics(principal: SessionPrincipal): Promise<AttentionMetrics> {
  if (postgresAdminRuntimeEnabled()) return postgresAttentionMetrics(principal);
  const dashboard = await adminDashboard(principal);
  return {
    vendorVerificationQueue: dashboard.metrics.vendorVerificationQueue,
    catalogReviewQueue: dashboard.metrics.catalogReviewQueue,
    pendingMedia: dashboard.metrics.pendingMedia,
    pendingCompliance: dashboard.metrics.pendingCompliance,
    payableProcurements: dashboard.metrics.payableProcurements,
    fairnessAppeals: dashboard.metrics.fairnessAppeals
  };
}

/**
 * Cheap, read-only queue counts for the persistent Admin shell.
 * Counts are only returned for domains the current principal may access;
 * zero-value domains are omitted so the navigation stays quiet when queues are clear.
 */
export async function adminDomainAttentionBadges(principal: SessionPrincipal): Promise<Readonly<Record<string, number>>> {
  const metrics = await attentionMetrics(principal);
  const badges: Record<string, number> = {};
  const assign = (domainHref: string, value: number) => { if (value > 0) badges[domainHref] = value; };

  if (hasAdminPermission(principal, "vendor.manage")) assign("/admin/partners", metrics.vendorVerificationQueue);
  if (hasAdminPermission(principal, "catalog.read")) assign("/admin/matching", metrics.catalogReviewQueue);

  const trustAttention =
    (hasAdminPermission(principal, "catalog.read") ? metrics.pendingMedia + metrics.pendingCompliance : 0)
    + (hasAdminPermission(principal, "fairness.read") ? metrics.fairnessAppeals : 0);
  if (trustAttention > 0) assign("/admin/trust", trustAttention);

  if (hasAdminPermission(principal, "finance.read")) assign("/admin/finance", metrics.payableProcurements);
  return badges;
}

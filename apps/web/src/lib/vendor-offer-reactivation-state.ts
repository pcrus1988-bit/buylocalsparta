import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

type ReactivationRow = SqlRow & { offer_id: string; submission_status?: string | null };

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

/**
 * Admin archive authority lives in vendor_product_submissions, not in
 * vendor_offers.merchant_pause_active. A merchant pause can coexist with an Admin
 * archive, so using the pause bit alone would let the vendor UI misclassify (and
 * potentially attempt to restore) an offer that still needs Admin reactivation.
 */
export async function getVendorAdminArchivedOfferIds(principal: SessionPrincipal): Promise<ReadonlySet<string>> {
  if (!postgresVendorRuntimeEnabled()) return new Set();
  const vendorId = requiredVendorId(principal);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });

  try {
    const result = await uow.withTransaction({ actorUserId: principal.userId, vendorId, marketId: "sparta" }, (tx) => tx.query<ReactivationRow>(`
      SELECT vo.public_id AS offer_id,
             latest.submission_status
      FROM vendor_offers vo
      LEFT JOIN LATERAL (
        SELECT s.status::text AS submission_status
        FROM vendor_product_submissions s
        WHERE s.vendor_id=vo.vendor_id
          AND s.canonical_variant_id=vo.canonical_variant_id
          AND ((s.vendor_sku IS NULL AND vo.vendor_sku IS NULL) OR s.vendor_sku=vo.vendor_sku OR s.vendor_sku IS NULL)
        ORDER BY (s.vendor_sku=vo.vendor_sku) DESC NULLS LAST,s.updated_at DESC,s.id DESC
        LIMIT 1
      ) latest ON true
      WHERE vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1)
        AND vo.status='archived'
    `, [vendorId]), { readOnly: true });

    return new Set(result.rows
      .filter((row) => String(row.submission_status ?? "") === "archived")
      .map((row) => String(row.offer_id)));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "vendor.offer_reactivation_state_failed",
      vendorId: principal.vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
    // Fail closed: when archive provenance cannot be read, do not classify an
    // archived offer as vendor-restorable. The Admin activation path remains safe.
    throw error;
  }
}

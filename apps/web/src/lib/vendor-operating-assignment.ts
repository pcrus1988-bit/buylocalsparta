import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow,
  type VendorOperatingAssignment
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

function databaseAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve vendor operating scope from authoritative persisted relationships.
 *
 * vendor_businesses.market_id remains the operational tenancy boundary. A HUB can
 * elevate a non-Sparta vendor to SELF_GOVERNED only when both the market/HUB gateway
 * and canonical expansion HUB are explicitly active. Missing HUB configuration never
 * grants extra capability; the vendor remains MANAGED in its own persisted market.
 * Database-less preview/dev keeps the legacy Sparta fallback by returning no assignment.
 */
export async function resolveVendorOperatingAssignment(
  principal: SessionPrincipal
): Promise<VendorOperatingAssignment> {
  const vendorId = principal.vendorId?.trim();
  if (!vendorId || !databaseAvailable()) return {};

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(
    { actorUserId: principal.userId, vendorId },
    async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT
          m.code AS market_code,
          mhc.hub_code,
          COALESCE(vl.public_id, vl.id::text) AS location_id,
          mhc.is_operational AS market_hub_operational,
          eh.is_live AS expansion_hub_live,
          eh.is_sparta_legacy
        FROM vendor_businesses v
        JOIN markets m ON m.id = v.market_id
        LEFT JOIN market_hub_config mhc ON mhc.market_id = v.market_id
        LEFT JOIN expansion_hubs eh ON eh.hub_id = mhc.hub_code
        LEFT JOIN LATERAL (
          SELECT location.id, location.public_id
          FROM vendor_locations location
          WHERE location.vendor_id = v.id
            AND location.active = true
          ORDER BY location.is_primary DESC, location.created_at, location.id
          LIMIT 1
        ) vl ON true
        WHERE v.public_id = $1 OR v.id::text = $1
        LIMIT 1
      `, [vendorId]);

      if (result.rowCount !== 1) throw new Error("Vendor operating assignment not found");
      const row = result.rows[0];
      const marketId = text(row.market_code);
      if (!marketId) throw new Error("Vendor market assignment is invalid");

      const hubId = text(row.hub_code);
      const locationId = text(row.location_id);
      const isSpartaLegacy = row.is_sparta_legacy === true || marketId === "sparta";
      const selfGoverned = Boolean(
        hubId
        && row.market_hub_operational === true
        && row.expansion_hub_live === true
        && !isSpartaLegacy
      );

      return {
        marketId,
        ...(hubId ? { hubId } : {}),
        ...(locationId ? { locationId } : {}),
        operatingModel: selfGoverned ? "SELF_GOVERNED" : "MANAGED"
      };
    },
    { readOnly: true }
  );
}

import { cookies } from "next/headers";
import {
  DEFAULT_MANAGED_HUB_ID,
  DEFAULT_MANAGED_MARKET_ID,
  PostgresUnitOfWork,
  buildVendorOperatingContextFromSession,
  vendorOperatingAssignmentFromPersistedScope,
  type SessionPrincipal,
  type SqlRow,
  type VendorOperatingAssignment,
  type VendorOperatingContext
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertVendorCsrf, vendorSessionFromToken, VENDOR_SESSION_COOKIE } from "./vendor-runtime";

type VendorOperatingScopeRow = SqlRow & {
  market_id: string;
  hub_id: string | null;
  location_id: string | null;
};

export async function getVendorSession(): Promise<SessionPrincipal | undefined> {
  const token = (await cookies()).get(VENDOR_SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const principal = await vendorSessionFromToken(token, Date.now());
  if (!principal?.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) return undefined;
  return principal;
}

async function resolvePersistedVendorOperatingAssignment(principal: SessionPrincipal): Promise<VendorOperatingAssignment> {
  const vendorId = principal.vendorId?.trim();
  if (!vendorId) throw new Error("VENDOR_SCOPE_REQUIRED");

  // Preview/development installations may intentionally run without PostgreSQL. Preserve the
  // established Sparta managed behaviour there; production vendor scope is always DB-derived.
  if (!productionDatabaseConfigured()) {
    return vendorOperatingAssignmentFromPersistedScope({
      marketId: DEFAULT_MANAGED_MARKET_ID,
      hubId: DEFAULT_MANAGED_HUB_ID
    });
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(
    { actorUserId: principal.userId, vendorId },
    async (tx) => {
      const result = await tx.query<VendorOperatingScopeRow>(`
        SELECT
          m.code AS market_id,
          mhc.hub_code AS hub_id,
          COALESCE(vl.public_id, vl.id::text) AS location_id
        FROM vendor_businesses vb
        JOIN markets m ON m.id = vb.market_id
        LEFT JOIN market_hub_config mhc ON mhc.market_id = vb.market_id
        LEFT JOIN LATERAL (
          SELECT l.id, l.public_id
          FROM vendor_locations l
          WHERE l.vendor_id = vb.id
            AND l.active = true
          ORDER BY l.is_primary DESC, l.created_at ASC, l.id ASC
          LIMIT 1
        ) vl ON true
        WHERE (vb.public_id = $1 OR vb.id::text = $1)
          AND vb.id = nullif(current_setting('app.vendor_id', true), '')::uuid
        LIMIT 1
      `, [vendorId]);

      if (result.rowCount !== 1 || result.rows.length !== 1) throw new Error("VENDOR_OPERATING_ASSIGNMENT_NOT_FOUND");
      const row = result.rows[0];
      return vendorOperatingAssignmentFromPersistedScope({
        marketId: typeof row.market_id === "string" ? row.market_id : "",
        hubId: typeof row.hub_id === "string" ? row.hub_id : undefined,
        locationId: typeof row.location_id === "string" ? row.location_id : undefined
      });
    },
    { readOnly: true }
  );
}

export async function getVendorOperatingContext(
  assignment?: VendorOperatingAssignment
): Promise<VendorOperatingContext | undefined> {
  const principal = await getVendorSession();
  if (!principal) return undefined;
  const resolvedAssignment = assignment ?? await resolvePersistedVendorOperatingAssignment(principal);
  return buildVendorOperatingContextFromSession(principal, resolvedAssignment);
}

export async function requireVendorSession(request?: Request, csrf = false): Promise<SessionPrincipal> {
  const principal = await getVendorSession();
  if (!principal) throw new Error("VENDOR_AUTH_REQUIRED");
  if (csrf) assertVendorCsrf(principal, request?.headers.get("x-csrf-token") ?? undefined);
  return principal;
}

export async function requireVendorOperatingContext(
  assignment?: VendorOperatingAssignment,
  request?: Request,
  csrf = false
): Promise<VendorOperatingContext> {
  const principal = await requireVendorSession(request, csrf);
  const resolvedAssignment = assignment ?? await resolvePersistedVendorOperatingAssignment(principal);
  return buildVendorOperatingContextFromSession(principal, resolvedAssignment);
}

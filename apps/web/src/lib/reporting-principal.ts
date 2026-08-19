import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reporting persistence stores ownership/audit actors using the internal users.id UUID.
 * Authentication principals intentionally expose the stable application-facing users.public_id
 * (for example usr_admin_...), so report entry points must translate that identifier before
 * querying UUID columns. Keep this adapter report-scoped: other platform services may rely on
 * the public principal identifier for their own audit/event contracts.
 */
export async function resolveReportPrincipal(principal: SessionPrincipal): Promise<SessionPrincipal> {
  if (!productionDatabaseConfigured()) return principal;

  const pool = getProductionPostgresRuntime().nativePool;
  const result = UUID_RE.test(principal.userId)
    ? await pool.query(`SELECT id::text FROM users WHERE id=$1::uuid LIMIT 1`, [principal.userId])
    : await pool.query(`SELECT id::text FROM users WHERE public_id=$1 LIMIT 1`, [principal.userId]);

  const internalUserId = String(result.rows[0]?.id ?? "");
  if (!UUID_RE.test(internalUserId)) throw new Error("REPORT_ACTOR_NOT_FOUND");

  return { ...principal, userId: internalUserId };
}

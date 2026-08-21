import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reporting persistence stores ownership/audit actors using internal database UUIDs.
 * Authentication principals intentionally expose public application identifiers instead.
 *
 * The current authenticated session is the strongest identity link available because
 * user_sessions.user_id already references the exact internal users.id that owns the session.
 * Resolve through that link first. This also keeps reports working for accounts whose public
 * identifiers have changed format over time. Public/user/vendor identifiers remain a fallback
 * for non-session principals and legacy callers.
 */
export async function resolveReportPrincipal(principal: SessionPrincipal): Promise<SessionPrincipal> {
  if (!productionDatabaseConfigured()) return principal;

  const pool = getProductionPostgresRuntime().nativePool;
  const sessionRef = String(principal.sessionId ?? "").trim();
  const actorRef = String(principal.userId ?? "").trim();
  if (!sessionRef && !actorRef) throw new Error("REPORT_ACTOR_NOT_FOUND");

  let internalUserId = "";

  if (sessionRef) {
    const sessionActor = await pool.query(`
      SELECT u.id::text AS user_id
      FROM user_sessions us
      JOIN users u ON u.id=us.user_id
      WHERE us.public_id=$1 OR us.id::text=$1
      LIMIT 2
    `, [sessionRef]);

    if (sessionActor.rowCount === 1) {
      internalUserId = String(sessionActor.rows[0]?.user_id ?? "");
    }
  }

  if (!UUID_RE.test(internalUserId) && actorRef) {
    const actorResult = await pool.query(`
      SELECT DISTINCT u.id::text AS user_id
      FROM users u
      LEFT JOIN vendor_users vu ON vu.user_id=u.id
      WHERE u.id::text=$1
         OR u.public_id=$1
         OR vu.id::text=$1
         OR vu.public_id=$1
      LIMIT 2
    `, [actorRef]);

    if (actorResult.rowCount === 1) {
      internalUserId = String(actorResult.rows[0]?.user_id ?? "");
    }
  }

  if (!UUID_RE.test(internalUserId)) throw new Error("REPORT_ACTOR_NOT_FOUND");

  if (!principal.vendorId) return { ...principal, userId: internalUserId };

  const vendorRef = String(principal.vendorId).trim();
  const vendorResult = await pool.query(`
    SELECT DISTINCT vb.id::text AS vendor_id
    FROM vendor_users vu
    JOIN vendor_businesses vb ON vb.id=vu.vendor_id
    WHERE vu.user_id=$1::uuid
      AND vu.active=true
      AND (
        vb.id::text=$2
        OR vb.public_id=$2
        OR vu.id::text=$2
        OR vu.public_id=$2
      )
    LIMIT 2
  `, [internalUserId, vendorRef]);

  if (vendorResult.rowCount !== 1) throw new Error("REPORT_VENDOR_MEMBERSHIP_NOT_FOUND");
  const internalVendorId = String(vendorResult.rows[0]?.vendor_id ?? "");
  if (!UUID_RE.test(internalVendorId)) throw new Error("REPORT_VENDOR_MEMBERSHIP_NOT_FOUND");

  return { ...principal, userId: internalUserId, vendorId: internalVendorId };
}

import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerActiveSession = Readonly<{
  id: string;
  current: boolean;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}>;

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

export function customerSessionManagementReadiness(): { ready: boolean; message: string } {
  return productionDatabaseConfigured()
    ? { ready: true, message: "Active session management enabled" }
    : { ready: false, message: "Η διαχείριση ενεργών συνεδριών απαιτεί την ασφαλή υπηρεσία λογαριασμών PostgreSQL." };
}

export async function customerActiveSessions(principal: SessionPrincipal, now = Date.now()): Promise<readonly CustomerActiveSession[]> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) return [];
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query(`
    SELECT us.public_id,us.created_at,us.last_seen_at,us.expires_at
    FROM user_sessions us
    JOIN users u ON u.id=us.user_id
    WHERE u.public_id=$1 AND u.status<>'closed' AND us.expires_at>$2
    ORDER BY CASE WHEN us.public_id=$3 THEN 0 ELSE 1 END, us.last_seen_at DESC, us.created_at DESC
  `, [principal.userId, new Date(now), principal.sessionId]);
  return result.rows.map((row) => ({
    id: String(row.public_id),
    current: String(row.public_id) === principal.sessionId,
    createdAt: new Date(row.created_at as string | number | Date).getTime(),
    lastSeenAt: new Date(row.last_seen_at as string | number | Date).getTime(),
    expiresAt: new Date(row.expires_at as string | number | Date).getTime()
  }));
}

export async function revokeOtherCustomerSession(principal: SessionPrincipal, sessionId: string): Promise<{ revoked: boolean }> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Η διαχείριση συνεδριών απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  const normalized = sessionId.trim();
  if (!normalized || normalized.length > 160) throw new Error("Η συνεδρία δεν είναι έγκυρη.");
  if (normalized === principal.sessionId) throw new Error("Η τρέχουσα συνεδρία δεν κλείνει από αυτή την ενέργεια.");
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query(`
    DELETE FROM user_sessions us
    USING users u
    WHERE us.user_id=u.id
      AND u.public_id=$1
      AND us.public_id=$2
      AND us.public_id<>$3
    RETURNING us.public_id
  `, [principal.userId, normalized, principal.sessionId]);
  return { revoked: result.rowCount === 1 };
}

export async function revokeOtherCustomerSessions(principal: SessionPrincipal): Promise<{ revokedCount: number }> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Η διαχείριση συνεδριών απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query(`
    DELETE FROM user_sessions us
    USING users u
    WHERE us.user_id=u.id
      AND u.public_id=$1
      AND us.public_id<>$2
    RETURNING us.public_id
  `, [principal.userId, principal.sessionId]);
  return { revokedCount: result.rowCount };
}

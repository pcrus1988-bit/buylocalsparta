import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("DAILY_AUTH_REQUIRED");
  return principal.vendorId;
}

export async function acknowledgeDailyOrderNotification(principal: SessionPrincipal, notificationId: string, now = Date.now()) {
  if (!notificationId.trim()) throw new Error("Notification is required");
  if (!productionDatabaseConfigured()) return { ok: true, notificationId, acknowledgedAt: new Date(now).toISOString() };

  const vendorId = requiredVendorId(principal);
  const result = await getProductionPostgresRuntime().nativePool.query(`
    UPDATE notifications n
    SET read_at=COALESCE(n.read_at,$3)
    WHERE n.public_id=$1
      AND n.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2)
      AND n.channel='in_app'
      AND n.event_type='vendor.order_received'
    RETURNING n.public_id,n.read_at,n.payload
  `, [notificationId.trim(), vendorId, new Date(now)]);

  if (!result.rowCount) throw new Error("Η ειδοποίηση παραγγελίας δεν βρέθηκε ή δεν ανήκει σε αυτό το κατάστημα.");
  const row = result.rows[0] as { public_id: string; read_at: Date | string; payload?: Record<string, unknown> };
  return {
    ok: true,
    notificationId: String(row.public_id),
    acknowledgedAt: new Date(row.read_at).toISOString(),
    payload: row.payload ?? {}
  };
}

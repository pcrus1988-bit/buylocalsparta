import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export async function customerCartRecoveryPreference(principal: SessionPrincipal): Promise<boolean> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction({ platformAccess: true, requestId: `customer-cart-recovery-pref:${principal.userId}` }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT np.enabled
        FROM notification_preferences np
        JOIN users u ON u.id=np.user_id
       WHERE (u.public_id=$1 OR u.id::text=$1)
         AND np.channel='email'
         AND np.event_type='cart_recovery'
       ORDER BY np.updated_at DESC
       LIMIT 1
    `, [principal.userId]);
    return result.rows[0]?.enabled === true;
  }, { readOnly: true });
}

export async function setCustomerCartRecoveryPreference(principal: SessionPrincipal, enabled: boolean, now = Date.now()): Promise<boolean> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction({ platformAccess: true, requestId: `customer-cart-recovery-pref-set:${principal.userId}:${randomUUID()}` }, async (tx) => {
    const user = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE (public_id=$1 OR id::text=$1) AND status='active' LIMIT 1", [principal.userId]);
    const userId = typeof user.rows[0]?.id === "string" ? user.rows[0].id : undefined;
    if (!userId) throw new Error("Ο λογαριασμός δεν βρέθηκε.");
    await tx.query(`
      INSERT INTO notification_preferences(id,public_id,user_id,vendor_id,channel,event_type,enabled,updated_at)
      VALUES($1,$2,$3,NULL,'email','cart_recovery',$4,$5)
      ON CONFLICT (user_id,channel,event_type) WHERE user_id IS NOT NULL
      DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=EXCLUDED.updated_at
    `, [randomUUID(), `notification_preference_${randomUUID().replaceAll("-", "")}`, userId, enabled, new Date(now)]);
    return enabled;
  });
}
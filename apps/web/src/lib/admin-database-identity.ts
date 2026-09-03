import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";

export async function resolveAdminDatabaseUserId(db: SqlExecutor, principalUserId: string): Promise<string> {
  const identifier = principalUserId.trim();
  if (!identifier) throw new Error("Admin actor user id is required");

  const result = await db.query<SqlRow>(`
    SELECT id::text AS id
    FROM public.users
    WHERE public_id=$1 OR id::text=$1
    LIMIT 1
  `, [identifier]);
  const actorUserId = String(result.rows[0]?.id ?? "").trim();
  if (!actorUserId) {
    throw new Error("Admin actor user could not be resolved to an internal database UUID");
  }
  return actorUserId;
}

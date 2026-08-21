import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { customerScope } from "@buy-local-sparta/postgres-runtime";
import { getAccountRuntime } from "./account-runtime";
import { customerStateBackend } from "./customer-state-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export async function clearCustomerRecentlyViewed(principal: SessionPrincipal): Promise<number> {
  if (!principal.roles.includes("customer")) throw new Error("Customer account required");

  if (customerStateBackend() === "memory") {
    return getAccountRuntime().personalization.clearRecentlyViewed(principal.userId);
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction(customerScope(principal.userId), async (tx) => {
    const user = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1", [principal.userId]);
    if (user.rowCount !== 1) throw new Error("Customer account not found");
    const result = await tx.query("DELETE FROM recently_viewed_products WHERE user_id=$1", [String(user.rows[0].id)]);
    return result.rowCount;
  });
}

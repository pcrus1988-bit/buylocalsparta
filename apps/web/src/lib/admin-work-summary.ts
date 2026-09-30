import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { adminDashboard, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function adminWorkSummary(principal: SessionPrincipal): Promise<{ csrfToken: string; orders: number }> {
  if (!postgresAdminRuntimeEnabled()) {
    const dashboard = await adminDashboard(principal);
    return { csrfToken: dashboard.csrfToken, orders: dashboard.metrics.orders };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>("SELECT count(*)::int AS orders FROM customer_orders");
    return { csrfToken: principal.csrfToken, orders: count(result.rows[0]?.orders) };
  }, { readOnly: true });
}

import { PostgresOpenIcecatBulkRepository, type OpenIcecatBulkRunStatus, type SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminOpenIcecatIngestionStatus = Readonly<{
  runs: readonly OpenIcecatBulkRunStatus[];
}>;

export async function adminOpenIcecatIngestionStatus(principal: SessionPrincipal): Promise<AdminOpenIcecatIngestionStatus> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return { runs: [] };
  const runtime = getProductionPostgresRuntime();
  const repository = new PostgresOpenIcecatBulkRepository(runtime.sqlPool);
  return { runs: await repository.recentRuns(12) };
}

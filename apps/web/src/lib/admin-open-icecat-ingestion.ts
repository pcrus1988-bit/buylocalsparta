import type { OpenIcecatBulkRunStatus, OpenIcecatDetailQueueStats, SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminOpenIcecatIngestionStatus = Readonly<{
  runs: readonly OpenIcecatBulkRunStatus[];
  detail?: OpenIcecatDetailQueueStats;
}>;

export async function adminOpenIcecatIngestionStatus(principal: SessionPrincipal): Promise<AdminOpenIcecatIngestionStatus> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return { runs: [] };
  const runtime = getProductionPostgresRuntime();
  const runs = await runtime.persistence.openIcecatBulk.recentRuns(12);
  const sourceId = runs[0]?.sourceId;
  return {
    runs,
    detail: sourceId ? await runtime.persistence.openIcecatDetail.stats(sourceId) : undefined
  };
}

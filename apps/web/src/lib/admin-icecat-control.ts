import {
  DEFAULT_OPEN_ICECAT_CONTROL,
  OPEN_ICECAT_BULK_PROCESSING_VERSION,
  OPEN_ICECAT_DETAIL_PROCESSING_VERSION,
  PostgresUnitOfWork,
  openIcecatControlForStorage,
  openIcecatControlFromMetadata,
  type OpenIcecatControlSettings,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminIcecatWorkspace = Readonly<{
  state: "available" | "not_configured" | "unavailable";
  csrfToken: string;
  sourceName?: string;
  sourceActive?: boolean;
  settings: OpenIcecatControlSettings;
  processing: Readonly<{
    bulkVersion: string;
    detailVersion: string;
  }>;
}>;

function emptyWorkspace(principal: SessionPrincipal, state: "not_configured" | "unavailable"): AdminIcecatWorkspace {
  return {
    state,
    csrfToken: principal.csrfToken,
    settings: DEFAULT_OPEN_ICECAT_CONTROL,
    processing: { bulkVersion: OPEN_ICECAT_BULK_PROCESSING_VERSION, detailVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION },
  };
}

async function postgresWorkspace(principal: SessionPrincipal): Promise<AdminIcecatWorkspace> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  try {
    return await uow.withTransaction({ platformAccess: true }, async (tx) => {
      const sourceResult = await tx.query<SqlRow>(`
        SELECT s.id::text AS source_id, s.name, s.active, s.metadata
        FROM public.catalog_sources s
        JOIN public.markets m ON m.id=s.market_id
        WHERE s.code='open_icecat' AND m.code='sparta'
        LIMIT 1
      `);
      const source = sourceResult.rows[0];
      if (!source) return emptyWorkspace(principal, "not_configured");

      const settings = openIcecatControlFromMetadata(source.metadata);
      return {
        state: "available",
        csrfToken: principal.csrfToken,
        sourceName: String(source.name ?? "Open Icecat"),
        sourceActive: source.active === true,
        settings,
        processing: { bulkVersion: OPEN_ICECAT_BULK_PROCESSING_VERSION, detailVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION }
      };
    }, { readOnly: true, statementTimeoutMs: 8_000 });
  } catch {
    return emptyWorkspace(principal, "unavailable");
  }
}

export async function adminIcecatWorkspace(principal: SessionPrincipal): Promise<AdminIcecatWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return emptyWorkspace(principal, "not_configured");
  return postgresWorkspace(principal);
}

export async function adminUpdateIcecatSettings(principal: SessionPrincipal, input: unknown): Promise<AdminIcecatWorkspace> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("PostgreSQL admin runtime is required");

  const revision = new Date().toISOString();
  const governed = openIcecatControlForStorage(input, revision);
  const stored = JSON.stringify({ ...governed, updatedAt: revision, updatedBy: principal.userId });
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction({ platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      UPDATE public.catalog_sources s
      SET metadata=jsonb_set(COALESCE(s.metadata,'{}'::jsonb), '{icecat_control}', $1::jsonb, true)
      FROM public.markets m
      WHERE s.market_id=m.id AND s.code='open_icecat' AND m.code='sparta'
      RETURNING s.id::text AS source_id
    `, [stored]);
    if (result.rowCount !== 1) throw new Error("Sparta Open Icecat source configuration not found");
  }, { statementTimeoutMs: 8_000 });

  return postgresWorkspace(principal);
}

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

export type IcecatRunSummary = Readonly<{
  kind: "full" | "daily";
  status: "running" | "completed" | "failed";
  sourceRows: number;
  persisted: number;
  removed: number;
  rejected: number;
  filtered: number;
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  lastError?: string;
}>;

export type AdminIcecatWorkspace = Readonly<{
  state: "available" | "not_configured" | "unavailable";
  csrfToken: string;
  sourceName?: string;
  sourceActive?: boolean;
  settings: OpenIcecatControlSettings;
  credentials: Readonly<{
    usernameConfigured: boolean;
    apiTokenConfigured: boolean;
    contentTokenConfigured: boolean;
    passwordConfigured: boolean;
  }>;
  processing: Readonly<{
    bulkVersion: string;
    detailVersion: string;
  }>;
  latestRuns: readonly IcecatRunSummary[];
}>;

function integer(row: SqlRow, field: string): number {
  const value = Number(row[field] ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function runSummary(row: SqlRow): IcecatRunSummary {
  const kind = row.import_kind === "full" ? "full" : "daily";
  const status = row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "running";
  return {
    kind,
    status,
    sourceRows: integer(row, "source_rows"),
    persisted: integer(row, "persisted"),
    removed: integer(row, "removed"),
    rejected: integer(row, "rejected"),
    filtered: integer(row, "filtered"),
    startedAt: String(row.started_at ?? ""),
    completedAt: optionalString(row.completed_at),
    failedAt: optionalString(row.failed_at),
    lastError: optionalString(row.last_error)
  };
}

function credentialStatus() {
  return {
    usernameConfigured: Boolean(process.env.ICECAT_USERNAME?.trim()),
    apiTokenConfigured: Boolean(process.env.ICECAT_API_TOKEN?.trim()),
    contentTokenConfigured: Boolean(process.env.ICECAT_CONTENT_TOKEN?.trim()),
    passwordConfigured: Boolean(process.env.ICECAT_PASSWORD?.trim())
  } as const;
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
      if (!source) {
        return {
          state: "not_configured",
          csrfToken: principal.csrfToken,
          settings: DEFAULT_OPEN_ICECAT_CONTROL,
          credentials: credentialStatus(),
          processing: { bulkVersion: OPEN_ICECAT_BULK_PROCESSING_VERSION, detailVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION },
          latestRuns: []
        };
      }

      const settings = openIcecatControlFromMetadata(source.metadata);
      const runResult = await tx.query<SqlRow>(`
        SELECT DISTINCT ON (import_kind)
          import_kind, status, source_rows, persisted, removed, rejected, filtered,
          started_at::text, completed_at::text, failed_at::text, last_error
        FROM public.open_icecat_bulk_ingestion_runs
        WHERE source_id=$1::uuid AND processing_version=$2
        ORDER BY import_kind, started_at DESC
      `, [String(source.source_id), OPEN_ICECAT_BULK_PROCESSING_VERSION]);

      return {
        state: "available",
        csrfToken: principal.csrfToken,
        sourceName: String(source.name ?? "Open Icecat"),
        sourceActive: source.active === true,
        settings,
        credentials: credentialStatus(),
        processing: { bulkVersion: OPEN_ICECAT_BULK_PROCESSING_VERSION, detailVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION },
        latestRuns: runResult.rows.map(runSummary)
      };
    }, { readOnly: true, statementTimeoutMs: 8_000 });
  } catch {
    return {
      state: "unavailable",
      csrfToken: principal.csrfToken,
      settings: DEFAULT_OPEN_ICECAT_CONTROL,
      credentials: credentialStatus(),
      processing: { bulkVersion: OPEN_ICECAT_BULK_PROCESSING_VERSION, detailVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION },
      latestRuns: []
    };
  }
}

export async function adminIcecatWorkspace(principal: SessionPrincipal): Promise<AdminIcecatWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) {
    return {
      state: "not_configured",
      csrfToken: principal.csrfToken,
      settings: DEFAULT_OPEN_ICECAT_CONTROL,
      credentials: credentialStatus(),
      processing: { bulkVersion: OPEN_ICECAT_BULK_PROCESSING_VERSION, detailVersion: OPEN_ICECAT_DETAIL_PROCESSING_VERSION },
      latestRuns: []
    };
  }
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
    if (result.rowCount !== 1) throw new Error("Active Sparta Open Icecat source configuration not found");
  }, { statementTimeoutMs: 8_000 });

  return postgresWorkspace(principal);
}

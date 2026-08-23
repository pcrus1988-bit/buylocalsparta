import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { inspectAndPersistSearchConsoleUrl } from "./seo-gsc-history";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getSeoUrlRegistryWorkspace, type SeoUrlRegistryRow } from "./seo-url-registry";

const COVERAGE_MAX_AGE_HOURS = 168;
const SAMPLE_MAX_URLS = 10;

type InspectionRow = SqlRow & {
  route: string;
  verdict?: string | null;
  coverage_state?: string | null;
  indexing_state?: string | null;
  last_crawl_time?: Date | string | null;
  page_fetch_state?: string | null;
  google_canonical?: string | null;
  user_canonical?: string | null;
  captured_at: Date | string;
};

export type SeoGscCoverageState = "healthy" | "attention" | "missing";

export type SeoGscCoverageRow = Readonly<{
  id: string;
  route: string;
  label: string;
  kind: SeoUrlRegistryRow["kind"];
  canonicalUrl: string;
  state: SeoGscCoverageState;
  stale: boolean;
  canonicalMismatch: boolean;
  verdict?: string;
  coverageState?: string;
  indexingState?: string;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
  lastCrawlTime?: string;
  capturedAt?: string;
}>;

export type SeoGscIndexCoverageWorkspace = Readonly<{
  persistenceAvailable: boolean;
  rows: readonly SeoGscCoverageRow[];
  metrics: Readonly<{
    governedIndexable: number;
    inspected: number;
    healthy: number;
    attention: number;
    missing: number;
    stale: number;
    canonicalMismatch: number;
    failedVerdict: number;
    partialVerdict: number;
    indexingBlocked: number;
    fetchFailed: number;
  }>;
  maxAgeHours: number;
}>;

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function iso(value: unknown): string | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function canonicalComparable(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "") || undefined;
  }
}

function rowState(registry: SeoUrlRegistryRow, inspection: InspectionRow | undefined, nowMs: number): SeoGscCoverageRow {
  const capturedAt = inspection ? iso(inspection.captured_at) : undefined;
  const capturedMs = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  const stale = Boolean(capturedAt && (!Number.isFinite(capturedMs) || nowMs - capturedMs > COVERAGE_MAX_AGE_HOURS * 3_600_000));
  const googleCanonical = text(inspection?.google_canonical);
  const expectedCanonical = canonicalComparable(registry.canonicalUrl);
  const canonicalMismatch = Boolean(googleCanonical && expectedCanonical && canonicalComparable(googleCanonical) !== expectedCanonical);
  const verdict = text(inspection?.verdict);
  const indexingState = text(inspection?.indexing_state);
  const pageFetchState = text(inspection?.page_fetch_state);
  const indexingAllowed = !indexingState || indexingState === "INDEXING_ALLOWED";
  const fetchHealthy = !pageFetchState || pageFetchState === "SUCCESSFUL";
  const healthy = Boolean(inspection && !stale && verdict === "PASS" && !canonicalMismatch && indexingAllowed && fetchHealthy);
  return {
    id: registry.id,
    route: registry.route,
    label: registry.label,
    kind: registry.kind,
    canonicalUrl: registry.canonicalUrl,
    state: !inspection ? "missing" : healthy ? "healthy" : "attention",
    stale,
    canonicalMismatch,
    verdict,
    coverageState: text(inspection?.coverage_state),
    indexingState,
    pageFetchState,
    googleCanonical,
    userCanonical: text(inspection?.user_canonical),
    lastCrawlTime: iso(inspection?.last_crawl_time),
    capturedAt
  };
}

function samplingPriority(row: SeoGscCoverageRow): number {
  if (row.state === "missing") return 0;
  if (row.stale) return 1;
  if (row.state === "attention") return 2;
  return 3;
}

function coverageMetrics(rows: readonly SeoGscCoverageRow[]): SeoGscIndexCoverageWorkspace["metrics"] {
  return {
    governedIndexable: rows.length,
    inspected: rows.filter((row) => Boolean(row.capturedAt)).length,
    healthy: rows.filter((row) => row.state === "healthy").length,
    attention: rows.filter((row) => row.state === "attention").length,
    missing: rows.filter((row) => row.state === "missing").length,
    stale: rows.filter((row) => row.stale).length,
    canonicalMismatch: rows.filter((row) => row.canonicalMismatch).length,
    failedVerdict: rows.filter((row) => row.verdict === "FAIL").length,
    partialVerdict: rows.filter((row) => Boolean(row.verdict) && row.verdict !== "PASS" && row.verdict !== "FAIL").length,
    indexingBlocked: rows.filter((row) => Boolean(row.indexingState) && row.indexingState !== "INDEXING_ALLOWED").length,
    fetchFailed: rows.filter((row) => Boolean(row.pageFetchState) && row.pageFetchState !== "SUCCESSFUL").length
  };
}

export async function getSeoGscIndexCoverageWorkspace(principal: SessionPrincipal): Promise<SeoGscIndexCoverageWorkspace> {
  assertAdminPermission(principal, "content.read");
  const registry = await getSeoUrlRegistryWorkspace(principal);
  const targets = registry.rows.filter((row) => row.active && row.desiredIndexable);
  if (!productionDatabaseConfigured() || !registry.persistenceAvailable) {
    const rows = targets.map((row) => rowState(row, undefined, Date.now()));
    return { persistenceAvailable: false, rows, metrics: coverageMetrics(rows), maxAgeHours: COVERAGE_MAX_AGE_HOURS };
  }

  const routes = targets.map((row) => row.route);
  const latestByRoute = new Map<string, InspectionRow>();
  if (routes.length) {
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
    const result = await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => tx.query<InspectionRow>(`
      SELECT DISTINCT ON (i.route)
        i.route,i.verdict,i.coverage_state,i.indexing_state,i.last_crawl_time,i.page_fetch_state,
        i.google_canonical,i.user_canonical,i.captured_at
      FROM seo_gsc_url_inspections i
      WHERE i.market_id=nullif(current_setting('app.market_id',true),'')::uuid
        AND i.route=ANY($1::text[])
      ORDER BY i.route,i.captured_at DESC
    `, [routes]));
    for (const row of result.rows) latestByRoute.set(row.route, row);
  }

  const nowMs = Date.now();
  const rows = targets.map((row) => rowState(row, latestByRoute.get(row.route), nowMs))
    .sort((a, b) => samplingPriority(a) - samplingPriority(b) || (a.capturedAt ?? "").localeCompare(b.capturedAt ?? "") || a.route.localeCompare(b.route, "el"));
  return { persistenceAvailable: true, rows, metrics: coverageMetrics(rows), maxAgeHours: COVERAGE_MAX_AGE_HOURS };
}

export async function runGovernedSearchConsoleCoverageSample(principal: SessionPrincipal, requestedLimit: number) {
  assertAdminPermission(principal, "content.write");
  const workspace = await getSeoGscIndexCoverageWorkspace(principal);
  if (!workspace.persistenceAvailable) throw new Error("Google index coverage sampling requires PostgreSQL URL registry and inspection persistence.");
  const limit = Math.max(1, Math.min(SAMPLE_MAX_URLS, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : SAMPLE_MAX_URLS));
  const candidates = workspace.rows.slice(0, limit);
  const results: Array<Readonly<{ route: string; ok: boolean; verdict?: string; error?: string }>> = [];

  for (const candidate of candidates) {
    try {
      const persisted = await inspectAndPersistSearchConsoleUrl(principal, candidate.canonicalUrl);
      results.push({ route: candidate.route, ok: true, verdict: persisted.inspection.verdict });
    } catch (error) {
      results.push({ route: candidate.route, ok: false, error: error instanceof Error ? error.message : "URL Inspection failed." });
    }
  }

  const summary = { requested: limit, attempted: candidates.length, succeeded: results.filter((row) => row.ok).length, failed: results.filter((row) => !row.ok).length };
  await recordAdminAudit(principal, "seo.search_console.index_coverage_sample", "seo_gsc_index_coverage", marketCode(), "Run governed bounded Google index coverage sample", summary);
  return { ...summary, results } as const;
}

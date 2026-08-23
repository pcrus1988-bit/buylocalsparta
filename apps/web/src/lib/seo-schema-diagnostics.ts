import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { adminSeoCrawlGraph } from "./seo-crawl-graph";
import { getSeoEntityOverridesSnapshot } from "./seo-entity-overrides";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { missingSchemaTypes, schemaExpectationForNode } from "./seo-schema-policy";

export type SeoSchemaDiagnosticState = "healthy" | "missing" | "invalid" | "unexpected" | "suppressed" | "not_checked";

export type SeoSchemaDiagnosticRow = Readonly<{
  route: string;
  label: string;
  kind: "product" | "partner_vendor" | "research_vendor";
  pageId?: string;
  indexAllowed: boolean;
  schemaAllowed: boolean;
  expectedTypes: readonly string[];
  observedTypes: readonly string[];
  blockCount?: number;
  parseErrorCount?: number;
  runId?: string;
  capturedAt?: string;
  state: SeoSchemaDiagnosticState;
  missingTypes: readonly string[];
}>;

export type SeoSchemaDiagnosticsWorkspace = Readonly<{
  persistenceAvailable: boolean;
  rows: readonly SeoSchemaDiagnosticRow[];
  metrics: Readonly<{
    managed: number;
    allowed: number;
    healthy: number;
    missing: number;
    invalid: number;
    unexpected: number;
    suppressed: number;
    notChecked: number;
  }>;
}>;

type EvidenceRow = SqlRow & {
  route: string;
  page_public_id?: string | null;
  run_public_id?: string | null;
  captured_at?: Date | string | null;
  block_count?: number | string | null;
  schema_types?: unknown;
  parse_error_count?: number | string | null;
};

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function schemaTypes(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try { return schemaTypes(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function diagnosticState(input: {
  schemaAllowed: boolean;
  hasObservation: boolean;
  blockCount: number;
  parseErrorCount: number;
  missingTypes: readonly string[];
}): SeoSchemaDiagnosticState {
  if (!input.schemaAllowed) return input.hasObservation && input.blockCount > 0 ? "unexpected" : "suppressed";
  if (!input.hasObservation) return "not_checked";
  if (input.parseErrorCount > 0) return "invalid";
  if (input.blockCount === 0 || input.missingTypes.length > 0) return "missing";
  return "healthy";
}

export async function getSeoSchemaDiagnosticsWorkspace(principal: SessionPrincipal): Promise<SeoSchemaDiagnosticsWorkspace> {
  assertAdminPermission(principal, "content.read");
  const [graph, overrides] = await Promise.all([adminSeoCrawlGraph(principal), getSeoEntityOverridesSnapshot()]);
  const managedNodes = graph.nodes.filter((node) => node.kind === "product" || node.kind === "partner_vendor" || node.kind === "research_vendor");
  const evidence = new Map<string, EvidenceRow>();
  let persistenceAvailable = false;

  if (productionDatabaseConfigured()) {
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
    try {
      const result = await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, (tx) => tx.query<EvidenceRow>(`
        WITH latest AS (
          SELECT DISTINCT ON (r.route)
            r.route,run.public_id AS run_public_id,r.captured_at,
            o.block_count,o.schema_types,o.parse_error_count
          FROM seo_crawl_results r
          JOIN seo_crawl_runs run ON run.id=r.run_id
          LEFT JOIN seo_crawl_structured_data_observations o ON o.result_id=r.id
          WHERE run.market_id=nullif(current_setting('app.market_id',true),'')::uuid
          ORDER BY r.route,r.captured_at DESC,r.id DESC
        )
        SELECT u.route,u.public_id AS page_public_id,l.run_public_id,l.captured_at,
               l.block_count,l.schema_types,l.parse_error_count
        FROM seo_urls u
        LEFT JOIN latest l ON l.route=u.route
        WHERE u.market_id=nullif(current_setting('app.market_id',true),'')::uuid
      `), { readOnly: true });
      for (const row of result.rows) evidence.set(row.route, row);
      persistenceAvailable = true;
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "seo.schema_diagnostics_read_failed", message: error instanceof Error ? error.message : String(error) }));
    }
  }

  const rows: SeoSchemaDiagnosticRow[] = managedNodes.map((node) => {
    const expectation = schemaExpectationForNode(node, overrides.entries);
    const captured = evidence.get(node.route);
    const observedTypes = schemaTypes(captured?.schema_types);
    const hasObservation = captured?.block_count != null;
    const blockCount = hasObservation ? count(captured?.block_count) : undefined;
    const parseErrorCount = hasObservation ? count(captured?.parse_error_count) : undefined;
    const missingTypes = missingSchemaTypes(expectation, observedTypes);
    return {
      route: node.route,
      label: node.label,
      kind: node.kind as SeoSchemaDiagnosticRow["kind"],
      pageId: optionalText(captured?.page_public_id),
      indexAllowed: node.indexAllowed,
      schemaAllowed: expectation.allowed,
      expectedTypes: expectation.requiredTypes,
      observedTypes,
      blockCount,
      parseErrorCount,
      runId: optionalText(captured?.run_public_id),
      capturedAt: optionalIso(captured?.captured_at),
      state: diagnosticState({
        schemaAllowed: expectation.allowed,
        hasObservation,
        blockCount: blockCount ?? 0,
        parseErrorCount: parseErrorCount ?? 0,
        missingTypes
      }),
      missingTypes
    };
  }).sort((a, b) => {
    const order: Record<SeoSchemaDiagnosticState, number> = { invalid: 0, missing: 1, unexpected: 2, not_checked: 3, healthy: 4, suppressed: 5 };
    return order[a.state] - order[b.state] || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, "el");
  });

  return {
    persistenceAvailable,
    rows,
    metrics: {
      managed: rows.length,
      allowed: rows.filter((row) => row.schemaAllowed).length,
      healthy: rows.filter((row) => row.state === "healthy").length,
      missing: rows.filter((row) => row.state === "missing").length,
      invalid: rows.filter((row) => row.state === "invalid").length,
      unexpected: rows.filter((row) => row.state === "unexpected").length,
      suppressed: rows.filter((row) => row.state === "suppressed").length,
      notChecked: rows.filter((row) => row.state === "not_checked").length
    }
  };
}

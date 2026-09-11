import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueExceptionReason = "canonical_identity_ambiguous" | "material_variant_conflict";

export type CatalogueIdentityException = Readonly<{
  id: string;
  sourceProductId: string;
  sourceProductKey: string;
  title: string;
  sourceCode: string;
  sourceName: string;
  reasonCode: CatalogueExceptionReason;
  candidateCategoryId?: string;
  candidateCategoryCode?: string;
  candidateVariantId?: string;
  candidateVariantSlug?: string;
  details: Record<string, unknown>;
  createdAt: string;
}>;

export type CatalogueExceptionFilters = Readonly<{
  query?: string;
  reasonCode?: CatalogueExceptionReason;
}>;

export type CatalogueExceptionsWorkspace = Readonly<{
  csrfToken: string;
  totalOpen: number;
  ambiguousIdentity: number;
  materialConflicts: number;
  filteredTotal: number;
  truncated: boolean;
  exceptions: readonly CatalogueIdentityException[];
}>;

function integer(value: unknown, field: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Database field ${field} is not a non-negative safe integer`);
  }
  return parsed;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | undefined {
  const parsed = text(value).trim();
  return parsed || undefined;
}

function details(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function adminCatalogueExceptionsWorkspace(
  principal: SessionPrincipal,
  filters: CatalogueExceptionFilters = {}
): Promise<CatalogueExceptionsWorkspace> {
  assertAdminPermission(principal, "catalog.read");

  if (!postgresAdminRuntimeEnabled()) {
    return {
      csrfToken: principal.csrfToken,
      totalOpen: 0,
      ambiguousIdentity: 0,
      materialConflicts: 0,
      filteredTotal: 0,
      truncated: false,
      exceptions: []
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const query = filters.query?.trim() || null;
  const reasonCode = filters.reasonCode ?? null;

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const countsResult = await tx.query<SqlRow>(
      `SELECT
         COUNT(*)::int AS total_open,
         COUNT(*) FILTER (WHERE r.reason_code = 'canonical_identity_ambiguous')::int AS ambiguous_identity,
         COUNT(*) FILTER (WHERE r.reason_code = 'material_variant_conflict')::int AS material_conflicts
       FROM catalog_canonicalization_reviews r
       JOIN markets m ON m.id = r.market_id
       WHERE m.code = 'sparta'
         AND r.status = 'open'
         AND r.reason_code IN ('canonical_identity_ambiguous', 'material_variant_conflict')`
    );

    const listResult = await tx.query<SqlRow>(
      `SELECT
         r.id,
         r.source_product_id,
         csp.source_product_key,
         csp.title,
         cs.code AS source_code,
         cs.name AS source_name,
         r.reason_code,
         r.candidate_category_id,
         c.code AS candidate_category_code,
         r.candidate_variant_id,
         cv.slug AS candidate_variant_slug,
         r.details,
         r.created_at,
         COUNT(*) OVER()::int AS filtered_total
       FROM catalog_canonicalization_reviews r
       JOIN markets m ON m.id = r.market_id
       JOIN catalog_source_products csp ON csp.id = r.source_product_id
       JOIN catalog_sources cs ON cs.id = r.source_id
       LEFT JOIN categories c ON c.id = r.candidate_category_id
       LEFT JOIN canonical_variants cv ON cv.id = r.candidate_variant_id
       WHERE m.code = 'sparta'
         AND r.status = 'open'
         AND r.reason_code IN ('canonical_identity_ambiguous', 'material_variant_conflict')
         AND ($1::text IS NULL OR r.reason_code = $1::text)
         AND (
           $2::text IS NULL
           OR csp.title ILIKE '%' || $2::text || '%'
           OR csp.source_product_key ILIKE '%' || $2::text || '%'
           OR cs.code ILIKE '%' || $2::text || '%'
           OR cs.name ILIKE '%' || $2::text || '%'
           OR r.id::text ILIKE '%' || $2::text || '%'
           OR r.source_product_id::text ILIKE '%' || $2::text || '%'
           OR COALESCE(c.code, '') ILIKE '%' || $2::text || '%'
           OR COALESCE(r.candidate_variant_id::text, '') ILIKE '%' || $2::text || '%'
           OR COALESCE(cv.slug, '') ILIKE '%' || $2::text || '%'
         )
       ORDER BY r.created_at ASC, r.id ASC
       LIMIT 250`,
      [reasonCode, query]
    );

    const counts = countsResult.rows[0] ?? {};
    const totalOpen = integer(counts.total_open, "total_open");
    const filteredTotal = listResult.rows.length > 0
      ? integer(listResult.rows[0]?.filtered_total, "filtered_total")
      : 0;

    return {
      csrfToken: principal.csrfToken,
      totalOpen,
      ambiguousIdentity: integer(counts.ambiguous_identity, "ambiguous_identity"),
      materialConflicts: integer(counts.material_conflicts, "material_conflicts"),
      filteredTotal,
      truncated: filteredTotal > listResult.rows.length,
      exceptions: listResult.rows.map((row) => ({
        id: text(row.id),
        sourceProductId: text(row.source_product_id),
        sourceProductKey: text(row.source_product_key),
        title: text(row.title),
        sourceCode: text(row.source_code),
        sourceName: text(row.source_name),
        reasonCode: row.reason_code === "material_variant_conflict"
          ? "material_variant_conflict"
          : "canonical_identity_ambiguous",
        candidateCategoryId: optionalText(row.candidate_category_id),
        candidateCategoryCode: optionalText(row.candidate_category_code),
        candidateVariantId: optionalText(row.candidate_variant_id),
        candidateVariantSlug: optionalText(row.candidate_variant_slug),
        details: details(row.details),
        createdAt: text(row.created_at)
      }))
    };
  }, { readOnly: true });
}

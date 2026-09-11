import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueIdentityException = Readonly<{
  id: string;
  sourceProductId: string;
  sourceProductKey: string;
  title: string;
  sourceCode: string;
  sourceName: string;
  reasonCode: "canonical_identity_ambiguous" | "material_variant_conflict";
  candidateCategoryId?: string;
  candidateCategoryCode?: string;
  candidateVariantId?: string;
  candidateVariantSlug?: string;
  details: Record<string, unknown>;
  createdAt: string;
}>;

export type CatalogueExceptionsWorkspace = Readonly<{
  csrfToken: string;
  totalOpen: number;
  ambiguousIdentity: number;
  materialConflicts: number;
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
  principal: SessionPrincipal
): Promise<CatalogueExceptionsWorkspace> {
  assertAdminPermission(principal, "catalog.read");

  if (!postgresAdminRuntimeEnabled()) {
    return {
      csrfToken: principal.csrfToken,
      totalOpen: 0,
      ambiguousIdentity: 0,
      materialConflicts: 0,
      truncated: false,
      exceptions: []
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

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
         r.created_at
       FROM catalog_canonicalization_reviews r
       JOIN markets m ON m.id = r.market_id
       JOIN catalog_source_products csp ON csp.id = r.source_product_id
       JOIN catalog_sources cs ON cs.id = r.source_id
       LEFT JOIN categories c ON c.id = r.candidate_category_id
       LEFT JOIN canonical_variants cv ON cv.id = r.candidate_variant_id
       WHERE m.code = 'sparta'
         AND r.status = 'open'
         AND r.reason_code IN ('canonical_identity_ambiguous', 'material_variant_conflict')
       ORDER BY r.created_at ASC, r.id ASC
       LIMIT 250`
    );

    const counts = countsResult.rows[0] ?? {};
    const totalOpen = integer(counts.total_open, "total_open");

    return {
      csrfToken: principal.csrfToken,
      totalOpen,
      ambiguousIdentity: integer(counts.ambiguous_identity, "ambiguous_identity"),
      materialConflicts: integer(counts.material_conflicts, "material_conflicts"),
      truncated: totalOpen > listResult.rows.length,
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

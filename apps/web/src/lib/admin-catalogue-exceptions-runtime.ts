import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import {
  assertAdminPermission,
  postgresAdminRuntimeEnabled,
  recordAdminAudit
} from "./admin-runtime";
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

export type CatalogueExceptionResolutionInput =
  | Readonly<{
      kind: "resolve_to_canonical";
      exceptionId: string;
      canonicalVariantId: string;
      reason: string;
    }>
  | Readonly<{
      kind: "ignore";
      exceptionId: string;
      reason: string;
    }>;

export type CatalogueExceptionResolutionResult = Readonly<{
  exceptionId: string;
  status: "resolved" | "ignored";
  sourceProductId: string;
  canonicalVariantId?: string;
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

function resolutionReason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3) throw new Error("Resolution reason must be at least 3 characters");
  if (normalized.length > 1000) throw new Error("Resolution reason must be at most 1000 characters");
  return normalized;
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

export async function adminResolveCatalogueException(
  principal: SessionPrincipal,
  input: CatalogueExceptionResolutionInput
): Promise<CatalogueExceptionResolutionResult> {
  assertAdminPermission(principal, "catalog.write");
  const reason = resolutionReason(input.reason);

  if (!postgresAdminRuntimeEnabled()) {
    throw new Error("Catalogue exception resolution requires the PostgreSQL runtime");
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const reviewResult = await tx.query<SqlRow>(
      `SELECT
         r.id,
         r.source_product_id,
         r.market_id,
         r.reason_code,
         r.status
       FROM catalog_canonicalization_reviews r
       WHERE r.id = $1::uuid
       FOR UPDATE`,
      [input.exceptionId]
    );
    const review = reviewResult.rows[0];
    if (!review) throw new Error("Catalogue identity exception not found");
    if (text(review.status) !== "open") throw new Error("Catalogue identity exception is no longer open");
    if (!["canonical_identity_ambiguous", "material_variant_conflict"].includes(text(review.reason_code))) {
      throw new Error("Only strong-identity exceptions can be resolved from this workspace");
    }

    const sourceProductId = text(review.source_product_id);

    if (input.kind === "ignore") {
      await tx.query(
        `UPDATE catalog_canonicalization_reviews
            SET status = 'ignored',
                resolved_at = now(),
                updated_at = now(),
                details = details || jsonb_build_object(
                  'resolution', jsonb_build_object(
                    'kind', 'ignored',
                    'actorUserId', $2::text,
                    'reason', $3::text,
                    'resolvedAt', now()
                  )
                )
          WHERE id = $1::uuid`,
        [input.exceptionId, principal.userId, reason]
      );

      return {
        exceptionId: input.exceptionId,
        status: "ignored" as const,
        sourceProductId
      };
    }

    const targetResult = await tx.query<SqlRow>(
      `WITH source_evidence AS (
         SELECT
           csp.normalized_payload,
           NULLIF(btrim(COALESCE(
             csp.source_identity->>'gtin',
             csp.source_identity->>'ean',
             csp.source_identity->>'upc',
             csp.source_identity->>'isbn13',
             csp.source_identity->>'isbn',
             csp.normalized_payload->>'gtin',
             csp.normalized_payload->>'ean',
             csp.normalized_payload->>'upc',
             csp.normalized_payload->>'isbn13',
             csp.normalized_payload->>'isbn'
           )), '') AS raw_gtin,
           NULLIF(btrim(COALESCE(
             csp.source_identity->>'isbn10',
             csp.source_identity->>'isbn',
             csp.normalized_payload->>'isbn10',
             csp.normalized_payload->>'isbn'
           )), '') AS raw_isbn10,
           CASE
             WHEN jsonb_typeof(csp.normalized_payload->'variantAttributes') = 'object'
               THEN csp.normalized_payload->'variantAttributes'
             ELSE '{}'::jsonb
           END AS variant_attributes
         FROM catalog_source_products csp
         WHERE csp.id = $1::uuid
       )
       SELECT
         cv.id,
         bls_private.catalog_material_variant_conflict(se.variant_attributes, cv.variant_attributes) AS material_conflict,
         (
           (
             se.raw_gtin IS NOT NULL
             AND bls_private.catalog_gtin_is_valid(se.raw_gtin)
             AND (
               (
                 cv.gtin IS NOT NULL
                 AND bls_private.catalog_gtin_is_valid(cv.gtin)
                 AND bls_private.catalog_normalize_gtin(cv.gtin) = bls_private.catalog_normalize_gtin(se.raw_gtin)
               )
               OR EXISTS (
                 SELECT 1
                 FROM product_identifiers pi
                 WHERE pi.canonical_variant_id = cv.id
                   AND pi.active = true
                   AND pi.identifier_scope = 'trade_item'
                   AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
                   AND bls_private.catalog_normalize_gtin(pi.normalized_value) = bls_private.catalog_normalize_gtin(se.raw_gtin)
               )
             )
           )
           OR (
             se.raw_isbn10 IS NOT NULL
             AND bls_private.is_valid_isbn10(bls_private.catalog_normalize_isbn10(se.raw_isbn10))
             AND EXISTS (
               SELECT 1
               FROM product_identifiers pi
               WHERE pi.canonical_variant_id = cv.id
                 AND pi.active = true
                 AND pi.identifier_scope = 'trade_item'
                 AND pi.identifier_type = 'isbn10'
                 AND pi.normalized_value = bls_private.catalog_normalize_isbn10(se.raw_isbn10)
             )
           )
         ) AS strong_identity_match
       FROM canonical_variants cv
       CROSS JOIN source_evidence se
       WHERE cv.id = $2::uuid
         AND cv.market_id = $3::uuid
         AND cv.recalled = false
       LIMIT 1`,
      [sourceProductId, input.canonicalVariantId, text(review.market_id)]
    );
    const target = targetResult.rows[0];
    if (!target) throw new Error("Selected canonical does not exist in the exception market or is recalled");
    if (target.strong_identity_match !== true) {
      throw new Error("Selected canonical does not share the source product's valid strong identifier");
    }
    if (optionalText(target.material_conflict)) {
      throw new Error(`Selected canonical still has a material variant conflict: ${text(target.material_conflict)}`);
    }

    const approvedResult = await tx.query<SqlRow>(
      `SELECT canonical_variant_id
       FROM catalog_source_product_links
       WHERE source_product_id = $1::uuid
         AND link_status = 'approved'
       FOR UPDATE`,
      [sourceProductId]
    );
    const approvedVariantId = optionalText(approvedResult.rows[0]?.canonical_variant_id);
    if (approvedVariantId && approvedVariantId !== input.canonicalVariantId) {
      throw new Error("Source product is already approved against a different canonical");
    }

    await tx.query(
      `UPDATE catalog_source_product_links
          SET link_status = 'superseded',
              updated_at = now()
        WHERE source_product_id = $1::uuid
          AND canonical_variant_id <> $2::uuid
          AND link_status = 'candidate'`,
      [sourceProductId, input.canonicalVariantId]
    );

    await tx.query(
      `INSERT INTO catalog_source_product_links(
         source_product_id,
         canonical_variant_id,
         link_status,
         match_method,
         confidence,
         reasons,
         reviewed_by,
         reviewed_at
       ) VALUES(
         $1::uuid,
         $2::uuid,
         'approved',
         'manual',
         1.00000,
         jsonb_build_array(jsonb_build_object(
           'rule', 'admin_identity_exception_resolution',
           'exceptionId', $3::text,
           'reason', $4::text
         )),
         (SELECT u.id FROM users u WHERE u.id::text = $5::text LIMIT 1),
         now()
       )
       ON CONFLICT (source_product_id, canonical_variant_id) DO UPDATE
       SET link_status = 'approved',
           match_method = 'manual',
           confidence = 1.00000,
           reasons = EXCLUDED.reasons,
           reviewed_by = EXCLUDED.reviewed_by,
           reviewed_at = now(),
           updated_at = now()`,
      [sourceProductId, input.canonicalVariantId, input.exceptionId, reason, principal.userId]
    );

    await tx.query(
      `UPDATE catalog_canonicalization_reviews
          SET status = 'resolved',
              candidate_variant_id = $2::uuid,
              resolved_at = now(),
              updated_at = now(),
              details = details || jsonb_build_object(
                'resolution', jsonb_build_object(
                  'kind', 'resolved_to_canonical',
                  'canonicalVariantId', $2::text,
                  'actorUserId', $3::text,
                  'reason', $4::text,
                  'resolvedAt', now()
                )
              )
        WHERE id = $1::uuid`,
      [input.exceptionId, input.canonicalVariantId, principal.userId, reason]
    );

    return {
      exceptionId: input.exceptionId,
      status: "resolved" as const,
      sourceProductId,
      canonicalVariantId: input.canonicalVariantId
    };
  });

  await recordAdminAudit(
    principal,
    input.kind === "ignore"
      ? "catalogue.identity_exception.ignore"
      : "catalogue.identity_exception.resolve_to_canonical",
    "catalog_canonicalization_review",
    input.exceptionId,
    reason,
    result
  );

  return result;
}

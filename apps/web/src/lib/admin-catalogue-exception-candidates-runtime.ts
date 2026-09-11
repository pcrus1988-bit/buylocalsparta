import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueExceptionCanonicalCandidate = Readonly<{
  canonicalVariantId: string;
  slug: string;
  title: string;
  categoryCode?: string;
  gtin?: string;
  active: boolean;
  materialConflict?: string;
  safeToResolve: boolean;
}>;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | undefined {
  const valueText = text(value).trim();
  return valueText || undefined;
}

export async function adminCatalogueExceptionCandidates(
  principal: SessionPrincipal,
  exceptionId: string
): Promise<readonly CatalogueExceptionCanonicalCandidate[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!exceptionId.trim()) return [];
  if (!postgresAdminRuntimeEnabled()) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(
      `WITH source_evidence AS (
         SELECT
           r.market_id,
           CASE
             WHEN jsonb_typeof(csp.normalized_payload->'variantAttributes') = 'object'
               THEN csp.normalized_payload->'variantAttributes'
             ELSE '{}'::jsonb
           END AS variant_attributes,
           ARRAY(
             SELECT DISTINCT bls_private.catalog_normalize_gtin(ids.raw_value)
             FROM (VALUES
               (csp.source_identity->>'gtin'),
               (csp.source_identity->>'ean'),
               (csp.source_identity->>'upc'),
               (csp.source_identity->>'isbn13'),
               (csp.source_identity->>'isbn'),
               (csp.normalized_payload->>'gtin'),
               (csp.normalized_payload->>'ean'),
               (csp.normalized_payload->>'upc'),
               (csp.normalized_payload->>'isbn13'),
               (csp.normalized_payload->>'isbn')
             ) AS ids(raw_value)
             WHERE NULLIF(btrim(ids.raw_value), '') IS NOT NULL
               AND bls_private.catalog_gtin_is_valid(ids.raw_value)
             ORDER BY 1
           ) AS valid_gtin_values,
           ARRAY(
             SELECT DISTINCT bls_private.catalog_normalize_isbn10(ids.raw_value)
             FROM (VALUES
               (csp.source_identity->>'isbn10'),
               (csp.source_identity->>'isbn'),
               (csp.normalized_payload->>'isbn10'),
               (csp.normalized_payload->>'isbn')
             ) AS ids(raw_value)
             WHERE NULLIF(btrim(ids.raw_value), '') IS NOT NULL
               AND bls_private.is_valid_isbn10(
                 bls_private.catalog_normalize_isbn10(ids.raw_value)
               )
             ORDER BY 1
           ) AS valid_isbn10_values
         FROM catalog_canonicalization_reviews r
         JOIN catalog_source_products csp ON csp.id = r.source_product_id
         WHERE r.id = $1::uuid
           AND r.status = 'open'
           AND r.reason_code IN ('canonical_identity_ambiguous', 'material_variant_conflict')
       ), candidates AS (
         SELECT
           cv.id,
           cv.slug,
           cv.gtin,
           cv.active,
           c.code AS category_code,
           bls_private.catalog_material_variant_conflict(
             se.variant_attributes,
             cv.variant_attributes
           ) AS material_conflict
         FROM source_evidence se
         JOIN canonical_variants cv
           ON cv.market_id = se.market_id
          AND cv.recalled = false
         LEFT JOIN categories c ON c.id = cv.category_id
         WHERE (
           cardinality(se.valid_gtin_values) = 1
           AND (
             (
               cv.gtin IS NOT NULL
               AND bls_private.catalog_gtin_is_valid(cv.gtin)
               AND bls_private.catalog_normalize_gtin(cv.gtin) = se.valid_gtin_values[1]
             )
             OR EXISTS (
               SELECT 1
               FROM product_identifiers pi
               WHERE pi.canonical_variant_id = cv.id
                 AND pi.active = true
                 AND pi.identifier_scope = 'trade_item'
                 AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
                 AND bls_private.catalog_normalize_gtin(pi.normalized_value) = se.valid_gtin_values[1]
             )
           )
         ) OR (
           cardinality(se.valid_gtin_values) = 0
           AND cardinality(se.valid_isbn10_values) = 1
           AND EXISTS (
             SELECT 1
             FROM product_identifiers pi
             WHERE pi.canonical_variant_id = cv.id
               AND pi.active = true
               AND pi.identifier_scope = 'trade_item'
               AND pi.identifier_type = 'isbn10'
               AND pi.normalized_value = se.valid_isbn10_values[1]
           )
         )
       )
       SELECT
         c.id,
         c.slug,
         c.gtin,
         c.active,
         c.category_code,
         c.material_conflict,
         pt.title
       FROM candidates c
       LEFT JOIN LATERAL (
         SELECT t.title
         FROM product_translations t
         WHERE t.canonical_variant_id = c.id
         ORDER BY
           CASE t.locale WHEN 'el' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
           t.locale
         LIMIT 1
       ) pt ON true
       ORDER BY
         (c.material_conflict IS NULL) DESC,
         c.active DESC,
         c.slug,
         c.id
       LIMIT 25`,
      [exceptionId.trim()]
    );

    return result.rows.map((row) => {
      const materialConflict = optionalText(row.material_conflict);
      return {
        canonicalVariantId: text(row.id),
        slug: text(row.slug),
        title: optionalText(row.title) ?? text(row.slug),
        categoryCode: optionalText(row.category_code),
        gtin: optionalText(row.gtin),
        active: row.active === true,
        materialConflict,
        safeToResolve: !materialConflict
      };
    });
  }, { readOnly: true });
}

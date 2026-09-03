import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { resolveAdminDatabaseUserId } from "./admin-database-identity";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueControlledValueOption = Readonly<{
  id: string;
  code: string;
  label: string;
}>;

export type CatalogueControlledValueReview = Readonly<{
  sourceAttributeKey: string;
  sourceValue: string;
  attributeId: string;
  attributeCode: string;
  productTypeId: string;
  productTypeCode: string;
  mappingRuleId: string;
  options: readonly CatalogueControlledValueOption[];
}>;

export type CatalogueControlledValueMappingResult = Readonly<{
  sourceProductId: string;
  sourceAttributeKey: string;
  sourceValue: string;
  attributeCode: string;
  attributeValueId: string;
  attributeValueCode: string;
  mappedObservations: number;
  valueRuleId: string;
}>;

export async function adminCatalogueControlledValueReviews(
  principal: SessionPrincipal,
  sourceProductId?: string
): Promise<readonly CatalogueControlledValueReview[]> {
  assertAdminPermission(principal, "catalog.read");
  const productId = sourceProductId?.trim();
  if (!productId || !postgresAdminRuntimeEnabled()) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      WITH review_rows AS (
        SELECT a.source_attribute_key,
               bls_private.catalog_source_attribute_scalar(a.raw_value,a.normalized_value) AS source_value,
               a.attribute_id,
               ad.code AS attribute_code,
               r.id AS mapping_rule_id,
               r.product_type_id,
               pt.code AS product_type_code
        FROM public.catalog_source_attribute_observations a
        JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
        JOIN public.attribute_definitions ad
          ON ad.id=a.attribute_id AND ad.active=true AND ad.data_type='enum'
        JOIN public.catalog_source_attribute_mapping_rules r
          ON r.source_id=sp.source_id
         AND r.source_attribute_key=a.source_attribute_key
         AND r.attribute_id=a.attribute_id
         AND r.status='approved'
         AND (
           (r.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=r.scope_key)
           OR
           (r.scope_kind='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
             NULLIF(btrim(sp.source_identity->>'categoryId'),''),
             NULLIF(btrim(sp.source_identity->>'category_id'),''),
             NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
           )=r.scope_key)
         )
        JOIN public.product_types pt ON pt.id=r.product_type_id AND pt.status='active'
        WHERE sp.id=$1::uuid
          AND a.mapping_status='review_required'
          AND a.attribute_value_id IS NULL
      )
      SELECT rr.source_attribute_key,
             rr.source_value,
             rr.attribute_id::text AS attribute_id,
             rr.attribute_code,
             rr.mapping_rule_id::text AS mapping_rule_id,
             rr.product_type_id::text AS product_type_id,
             rr.product_type_code,
             av.id::text AS attribute_value_id,
             av.code AS attribute_value_code,
             COALESCE(NULLIF(avt.label,''),av.code) AS attribute_value_label
      FROM review_rows rr
      JOIN public.attribute_values av
        ON av.attribute_id=rr.attribute_id AND av.active=true
      LEFT JOIN public.attribute_value_translations avt
        ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE rr.source_value IS NOT NULL
        AND (
          NOT EXISTS (
            SELECT 1
            FROM public.product_type_attribute_allowed_values allowed
            WHERE allowed.product_type_id=rr.product_type_id
              AND allowed.attribute_id=rr.attribute_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.product_type_attribute_allowed_values allowed
            WHERE allowed.product_type_id=rr.product_type_id
              AND allowed.attribute_id=rr.attribute_id
              AND allowed.attribute_value_id=av.id
          )
        )
      ORDER BY rr.source_attribute_key,av.sort_order,av.code,av.id
      LIMIT 5000
    `, [productId]);

    const reviews = new Map<string, {
      sourceAttributeKey: string;
      sourceValue: string;
      attributeId: string;
      attributeCode: string;
      productTypeId: string;
      productTypeCode: string;
      mappingRuleId: string;
      options: CatalogueControlledValueOption[];
    }>();
    for (const row of result.rows) {
      const key = required(row.source_attribute_key, "source attribute key");
      const mappingRuleId = required(row.mapping_rule_id, "mapping rule.id");
      const groupKey = `${key}:${mappingRuleId}`;
      let review = reviews.get(groupKey);
      if (!review) {
        review = {
          sourceAttributeKey: key,
          sourceValue: required(row.source_value, "source value"),
          attributeId: required(row.attribute_id, "attribute.id"),
          attributeCode: required(row.attribute_code, "attribute.code"),
          productTypeId: required(row.product_type_id, "product type.id"),
          productTypeCode: required(row.product_type_code, "product type.code"),
          mappingRuleId,
          options: []
        };
        reviews.set(groupKey, review);
      }
      review.options.push({
        id: required(row.attribute_value_id, "attribute value.id"),
        code: required(row.attribute_value_code, "attribute value.code"),
        label: required(row.attribute_value_label, "attribute value.label")
      });
    }
    return [...reviews.values()];
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

export async function mapCatalogueSourceAttributeValue(
  principal: SessionPrincipal,
  input: {
    sourceProductId: string;
    sourceAttributeKey: string;
    attributeValueId: string;
    reason?: string;
  }
): Promise<CatalogueControlledValueMappingResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");

  const sourceProductId = input.sourceProductId.trim();
  const sourceAttributeKey = input.sourceAttributeKey.trim();
  const attributeValueId = input.attributeValueId.trim();
  const reason = input.reason?.trim() || "Reviewed controlled source value in Supplier PIM";
  if (!sourceProductId || !sourceAttributeKey || !attributeValueId) {
    throw new Error("Source product, source attribute and controlled canonical value are required");
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 30_000, lockTimeoutMs: 3_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const actorUserId = await resolveAdminDatabaseUserId(tx, principal.userId);
    const contextResult = await tx.query<SqlRow>(`
      SELECT a.id::text AS observation_id,
             a.attribute_id::text AS attribute_id,
             ad.code AS attribute_code,
             bls_private.catalog_source_attribute_scalar(a.raw_value,a.normalized_value) AS source_value,
             r.id::text AS mapping_rule_id,
             r.product_type_id::text AS product_type_id
      FROM public.catalog_source_attribute_observations a
      JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
      JOIN public.attribute_definitions ad
        ON ad.id=a.attribute_id AND ad.active=true AND ad.data_type='enum'
      JOIN public.catalog_source_attribute_mapping_rules r
        ON r.source_id=sp.source_id
       AND r.source_attribute_key=a.source_attribute_key
       AND r.attribute_id=a.attribute_id
       AND r.status='approved'
       AND (
         (r.scope_kind='taxonomy_node' AND sp.source_taxonomy_node_id::text=r.scope_key)
         OR
         (r.scope_kind='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
           NULLIF(btrim(sp.source_identity->>'categoryId'),''),
           NULLIF(btrim(sp.source_identity->>'category_id'),''),
           NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
         )=r.scope_key)
       )
      WHERE sp.id=$1::uuid
        AND a.source_attribute_key=$2
        AND a.mapping_status='review_required'
        AND a.attribute_value_id IS NULL
      ORDER BY a.position,a.id
      LIMIT 1
      FOR UPDATE OF a,r
    `, [sourceProductId, sourceAttributeKey]);
    const context = contextResult.rows[0];
    if (!context) throw new Error("This controlled source value is no longer awaiting review");

    const attributeId = required(context.attribute_id, "attribute.id");
    const attributeCode = required(context.attribute_code, "attribute.code");
    const sourceValue = required(context.source_value, "source controlled value");
    const mappingRuleId = required(context.mapping_rule_id, "mapping rule.id");
    const productTypeId = required(context.product_type_id, "product type.id");

    const targetResult = await tx.query<SqlRow>(`
      SELECT av.id::text AS id,av.code
      FROM public.attribute_values av
      WHERE av.id=$1::uuid
        AND av.attribute_id=$2::uuid
        AND av.active=true
        AND (
          NOT EXISTS (
            SELECT 1
            FROM public.product_type_attribute_allowed_values allowed
            WHERE allowed.product_type_id=$3::uuid AND allowed.attribute_id=$2::uuid
          )
          OR EXISTS (
            SELECT 1
            FROM public.product_type_attribute_allowed_values allowed
            WHERE allowed.product_type_id=$3::uuid
              AND allowed.attribute_id=$2::uuid
              AND allowed.attribute_value_id=av.id
          )
        )
      LIMIT 1
    `, [attributeValueId, attributeId, productTypeId]);
    const target = targetResult.rows[0];
    if (!target) throw new Error("The selected controlled value is inactive, belongs to another attribute, or is not allowed for this Product Type");
    const attributeValueCode = required(target.code, "attribute value.code");

    const existingResult = await tx.query<SqlRow>(`
      SELECT id::text AS id,attribute_value_id::text AS attribute_value_id
      FROM public.catalog_source_attribute_value_mapping_rules
      WHERE attribute_mapping_rule_id=$1::uuid
        AND source_value_key=bls_private.catalog_source_controlled_value_key($2)
        AND status='approved'
      FOR UPDATE
    `, [mappingRuleId, sourceValue]);
    const existing = existingResult.rows[0];
    if (existing && required(existing.attribute_value_id, "controlled value rule target") !== attributeValueId) {
      throw new Error("An approved controlled-value rule already maps this exact source value differently. Supersede that rule explicitly before changing its meaning.");
    }

    let valueRuleId = optional(existing?.id);
    if (!valueRuleId) {
      const inserted = await tx.query<SqlRow>(`
        INSERT INTO public.catalog_source_attribute_value_mapping_rules(
          attribute_mapping_rule_id,attribute_id,source_value,source_value_key,
          attribute_value_id,status,mapping_method,reason,reviewed_by,reviewed_at,metadata
        ) VALUES(
          $1::uuid,$2::uuid,$3,'pending-trigger-normalization',$4::uuid,
          'approved','admin_exact_controlled_value',$5,$6::uuid,now(),
          jsonb_build_object('createdFromSourceProductId',$7::text,'mappingVersion','controlled_value_v1')
        )
        RETURNING id::text AS id
      `, [mappingRuleId, attributeId, sourceValue, attributeValueId, reason, actorUserId, sourceProductId]);
      valueRuleId = required(inserted.rows[0]?.id, "controlled value rule.id");
    }

    const backfill = await tx.query<SqlRow>(`
      SELECT bls_private.backfill_catalog_source_attribute_value_mapping_rule($1::uuid,$2::uuid)::text AS mapped
    `, [valueRuleId, actorUserId]);
    const mappedObservations = numberValue(backfill.rows[0]?.mapped);

    return {
      sourceProductId,
      sourceAttributeKey,
      sourceValue,
      attributeCode,
      attributeValueId,
      attributeValueCode,
      mappedObservations,
      valueRuleId
    } satisfies CatalogueControlledValueMappingResult;
  }, { statementTimeoutMs: 30_000 });

  await recordAdminAudit(
    principal,
    "catalogue.source_attribute_value_mapping.approved",
    "catalog_source_attribute_value_mapping_rule",
    result.valueRuleId,
    reason,
    {
      sourceProductId: result.sourceProductId,
      sourceAttributeKey: result.sourceAttributeKey,
      sourceValue: result.sourceValue,
      attributeCode: result.attributeCode,
      attributeValueId: result.attributeValueId,
      attributeValueCode: result.attributeValueCode,
      mappedObservations: result.mappedObservations
    }
  );
  return result;
}

function required(value: unknown, name: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}
function optional(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}
function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Expected a non-negative controlled-value mapping count");
  return parsed;
}

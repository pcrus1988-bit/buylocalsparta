import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueAttributeDefinitionOption = Readonly<{
  attributeId: string;
  attributeCode: string;
  dataType: string;
  unit?: string;
  valueMode: string;
  groupCode?: string;
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  valueLevel: "family" | "variant";
  allowMultiple: boolean;
}>;

export type CatalogueSourceAttributeMappingResult = Readonly<{
  sourceProductId: string;
  sourceName: string;
  sourceAttributeKey: string;
  scopeKind: "taxonomy_node" | "source_category";
  scopeKey: string;
  productTypeId: string;
  productTypeCode: string;
  attributeId: string;
  attributeCode: string;
  mappedObservations: number;
  reviewRequiredObservations: number;
  ruleId: string;
}>;

export async function adminCatalogueAttributeDefinitions(
  principal: SessionPrincipal
): Promise<readonly CatalogueAttributeDefinitionOption[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT ad.id::text AS attribute_id,
             ad.code AS attribute_code,
             ad.data_type,
             COALESCE(pta.unit_override,ad.unit) AS effective_unit,
             ad.value_mode,
             ad.group_code,
             pt.id::text AS product_type_id,
             pt.code AS product_type_code,
             COALESCE(NULLIF(ptt.name,''),pt.code) AS product_type_name,
             pta.value_level,
             pta.allow_multiple
      FROM public.product_type_attributes pta
      JOIN public.product_types pt
        ON pt.id=pta.product_type_id AND pt.status='active'
      JOIN public.attribute_definitions ad
        ON ad.id=pta.attribute_id AND ad.active=true
      LEFT JOIN public.product_type_translations ptt
        ON ptt.product_type_id=pt.id AND upper(ptt.locale)='EL'
      ORDER BY COALESCE(NULLIF(ptt.name,''),pt.code),
               COALESCE(ad.group_code,''), pta.sort_order, ad.code, ad.id
      LIMIT 5000
    `);
    return result.rows.map((row) => ({
      attributeId: required(row.attribute_id, "attribute.id"),
      attributeCode: required(row.attribute_code, "attribute.code"),
      dataType: required(row.data_type, "attribute.data_type"),
      unit: optional(row.effective_unit),
      valueMode: required(row.value_mode, "attribute.value_mode"),
      groupCode: optional(row.group_code),
      productTypeId: required(row.product_type_id, "product type.id"),
      productTypeCode: required(row.product_type_code, "product type.code"),
      productTypeName: required(row.product_type_name, "product type.name"),
      valueLevel: required(row.value_level, "product type attribute.value_level") as "family" | "variant",
      allowMultiple: Boolean(row.allow_multiple)
    }));
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

export async function mapCatalogueSourceAttribute(
  principal: SessionPrincipal,
  input: {
    sourceProductId: string;
    sourceAttributeKey: string;
    productTypeId: string;
    attributeId: string;
    reason?: string;
  }
): Promise<CatalogueSourceAttributeMappingResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");

  const sourceProductId = input.sourceProductId.trim();
  const sourceAttributeKey = input.sourceAttributeKey.trim();
  const productTypeId = input.productTypeId.trim();
  const attributeId = input.attributeId.trim();
  const reason = input.reason?.trim() || "Reviewed in Supplier PIM source-attribute mapping";
  if (!sourceProductId || !sourceAttributeKey || !productTypeId || !attributeId) {
    throw new Error("Source product, source attribute, Product Type and canonical attribute are required");
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 30_000, lockTimeoutMs: 3_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const contextResult = await tx.query<SqlRow>(`
      SELECT sp.source_id::text AS source_id,
             s.name AS source_name,
             sp.source_taxonomy_node_id::text AS source_taxonomy_node_id,
             COALESCE(
               NULLIF(btrim(sp.source_identity->>'categoryId'),''),
               NULLIF(btrim(sp.source_identity->>'category_id'),''),
               NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
             ) AS provider_category,
             count(a.id)::integer AS observations,
             count(a.id) FILTER (
               WHERE a.mapping_status='unmapped' AND a.attribute_id IS NULL
             )::integer AS unresolved
      FROM public.catalog_source_products sp
      JOIN public.catalog_sources s ON s.id=sp.source_id
      JOIN public.catalog_source_attribute_observations a
        ON a.source_product_id=sp.id
       AND a.source_attribute_key=$2::text
      WHERE sp.id=$1::uuid
      GROUP BY sp.source_id,s.name,sp.source_taxonomy_node_id,sp.source_identity,sp.normalized_payload
      LIMIT 1
    `, [sourceProductId, sourceAttributeKey]);
    const context = contextResult.rows[0];
    if (!context) throw new Error("The selected source attribute observation was not found");
    if (numberValue(context.unresolved) < 1) throw new Error("This source attribute is no longer unresolved");

    const sourceId = required(context.source_id, "source.id");
    const taxonomyNodeId = optional(context.source_taxonomy_node_id);
    const providerCategory = optional(context.provider_category);
    const scopeKind: "taxonomy_node" | "source_category" = taxonomyNodeId ? "taxonomy_node" : "source_category";
    const scopeKey = taxonomyNodeId ?? providerCategory;
    if (!scopeKey) {
      throw new Error("This source row has no taxonomy/category context. Map or retain its source category before creating a reusable attribute rule.");
    }

    const targetResult = await tx.query<SqlRow>(`
      SELECT ad.id::text AS attribute_id,
             ad.code AS attribute_code,
             ad.data_type,
             COALESCE(pta.unit_override,ad.unit) AS effective_unit,
             pt.id::text AS product_type_id,
             pt.code AS product_type_code
      FROM public.product_type_attributes pta
      JOIN public.product_types pt
        ON pt.id=pta.product_type_id AND pt.status='active'
      JOIN public.attribute_definitions ad
        ON ad.id=pta.attribute_id AND ad.active=true
      WHERE pta.product_type_id=$1::uuid AND pta.attribute_id=$2::uuid
      LIMIT 1
    `, [productTypeId, attributeId]);
    const target = targetResult.rows[0];
    if (!target) throw new Error("The selected attribute is not active/allowed for the selected Product Type");
    const attributeCode = required(target.attribute_code, "attribute.code");
    const productTypeCode = required(target.product_type_code, "product type.code");

    const conflictingMappedResult = await tx.query<SqlRow>(`
      SELECT a.attribute_id::text AS attribute_id, d.code AS attribute_code
      FROM public.catalog_source_attribute_observations a
      JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
      LEFT JOIN public.attribute_definitions d ON d.id=a.attribute_id
      WHERE sp.source_id=$1::uuid
        AND a.source_attribute_key=$2::text
        AND (
          ($3='taxonomy_node' AND sp.source_taxonomy_node_id::text=$4)
          OR
          ($3='source_category' AND sp.source_taxonomy_node_id IS NULL AND COALESCE(
            NULLIF(btrim(sp.source_identity->>'categoryId'),''),
            NULLIF(btrim(sp.source_identity->>'category_id'),''),
            NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
          )=$4)
        )
        AND a.mapping_status IN ('mapped','review_required')
        AND a.attribute_id IS NOT NULL
        AND a.attribute_id<>$5::uuid
      ORDER BY a.created_at ASC, a.id ASC
      LIMIT 1
    `, [sourceId, sourceAttributeKey, scopeKind, scopeKey, attributeId]);
    if (conflictingMappedResult.rowCount > 0) {
      const conflict = conflictingMappedResult.rows[0];
      throw new Error(`This source key/context already has evidence linked to ${optional(conflict.attribute_code) ?? required(conflict.attribute_id, "conflicting attribute")}. Review the historical rule before changing its meaning.`);
    }

    const existingRuleResult = await tx.query<SqlRow>(`
      SELECT id::text AS id, product_type_id::text AS product_type_id,
             attribute_id::text AS attribute_id
      FROM public.catalog_source_attribute_mapping_rules
      WHERE source_id=$1::uuid
        AND source_attribute_key=$2
        AND scope_kind=$3
        AND scope_key=$4
        AND status='approved'
      FOR UPDATE
    `, [sourceId, sourceAttributeKey, scopeKind, scopeKey]);
    const existingRule = existingRuleResult.rows[0];
    if (existingRule) {
      if (required(existingRule.product_type_id, "mapping rule product type") !== productTypeId
          || required(existingRule.attribute_id, "mapping rule attribute") !== attributeId) {
        throw new Error("An approved mapping already exists for this exact source context with a different Product Type/attribute. Supersede that rule explicitly before changing its meaning.");
      }
    }

    let ruleId = optional(existingRule?.id);
    if (!ruleId) {
      const ruleResult = await tx.query<SqlRow>(`
        INSERT INTO public.catalog_source_attribute_mapping_rules(
          source_id,source_attribute_key,scope_kind,scope_key,
          product_type_id,attribute_id,status,mapping_method,reason,
          reviewed_by,reviewed_at,metadata,created_at,updated_at
        ) VALUES (
          $1::uuid,$2,$3,$4,$5::uuid,$6::uuid,'approved','admin_exact_context',$7,
          $8::uuid,now(),
          jsonb_build_object(
            'mappingVersion','source_attribute_context_v2',
            'createdFromSourceProductId',$9::text
          ),
          now(),now()
        )
        RETURNING id::text AS id
      `, [sourceId, sourceAttributeKey, scopeKind, scopeKey, productTypeId, attributeId, reason, principal.userId, sourceProductId]);
      ruleId = required(ruleResult.rows[0]?.id, "mapping rule.id");
    }

    const backfillResult = await tx.query<SqlRow>(`
      SELECT mapping_status,row_count
      FROM bls_private.backfill_catalog_source_attribute_mapping_rule($1::uuid,$2::uuid)
    `, [ruleId, principal.userId]);
    const mappedObservations = backfillResult.rows
      .filter((row) => row.mapping_status === "mapped")
      .reduce((total, row) => total + numberValue(row.row_count), 0);
    const reviewRequiredObservations = backfillResult.rows
      .filter((row) => row.mapping_status === "review_required")
      .reduce((total, row) => total + numberValue(row.row_count), 0);

    return {
      sourceProductId,
      sourceName: required(context.source_name, "source.name"),
      sourceAttributeKey,
      scopeKind,
      scopeKey,
      productTypeId,
      productTypeCode,
      attributeId,
      attributeCode,
      mappedObservations,
      reviewRequiredObservations,
      ruleId
    } satisfies CatalogueSourceAttributeMappingResult;
  }, { statementTimeoutMs: 30_000 });

  await recordAdminAudit(
    principal,
    "catalogue.source_attribute_mapping.approved",
    "catalog_source_attribute_mapping_rule",
    result.ruleId,
    reason,
    {
      sourceName: result.sourceName,
      sourceAttributeKey: result.sourceAttributeKey,
      scopeKind: result.scopeKind,
      scopeKey: result.scopeKey,
      productTypeId: result.productTypeId,
      productTypeCode: result.productTypeCode,
      attributeId: result.attributeId,
      attributeCode: result.attributeCode,
      mappedObservations: result.mappedObservations,
      reviewRequiredObservations: result.reviewRequiredObservations
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
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import type { CatalogueControlledValueOption } from "./admin-catalogue-attribute-value-mapping";

export type CatalogueControlledValueQueueItem = Readonly<{
  representativeSourceProductId: string;
  sourceName: string;
  sourceAttributeKey: string;
  sourceValue: string;
  sourceValueKey: string;
  scopeKind: "taxonomy_node" | "source_category";
  scopeKey: string;
  attributeId: string;
  attributeCode: string;
  productTypeId: string;
  productTypeCode: string;
  mappingRuleId: string;
  occurrences: number;
  options: readonly CatalogueControlledValueOption[];
}>;

export async function adminCatalogueControlledValueQueue(
  principal: SessionPrincipal
): Promise<readonly CatalogueControlledValueQueueItem[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      WITH pending AS (
        SELECT sp.id AS source_product_id,
               s.name AS source_name,
               a.source_attribute_key,
               bls_private.catalog_source_attribute_scalar(a.raw_value,a.normalized_value) AS source_value,
               r.scope_kind,
               r.scope_key,
               r.id AS mapping_rule_id,
               r.product_type_id,
               pt.code AS product_type_code,
               a.attribute_id,
               ad.code AS attribute_code
        FROM public.catalog_source_attribute_observations a
        JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
        JOIN public.catalog_sources s ON s.id=sp.source_id
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
        WHERE a.mapping_status='review_required'
          AND a.attribute_value_id IS NULL
      ), grouped AS (
        SELECT mapping_rule_id,
               source_attribute_key,
               bls_private.catalog_source_controlled_value_key(source_value) AS source_value_key,
               min(source_value) AS source_value,
               min(source_name) AS source_name,
               min(source_product_id::text) AS representative_source_product_id,
               min(scope_kind) AS scope_kind,
               min(scope_key) AS scope_key,
               min(product_type_id::text) AS product_type_id,
               min(product_type_code) AS product_type_code,
               min(attribute_id::text) AS attribute_id,
               min(attribute_code) AS attribute_code,
               count(*)::integer AS occurrences
        FROM pending
        WHERE source_value IS NOT NULL
        GROUP BY mapping_rule_id,source_attribute_key,
                 bls_private.catalog_source_controlled_value_key(source_value)
        ORDER BY count(*) DESC,mapping_rule_id,source_attribute_key,
                 bls_private.catalog_source_controlled_value_key(source_value)
        LIMIT 200
      )
      SELECT g.representative_source_product_id,
             g.source_name,
             g.source_attribute_key,
             g.source_value,
             g.source_value_key,
             g.scope_kind,
             g.scope_key,
             g.attribute_id,
             g.attribute_code,
             g.product_type_id,
             g.product_type_code,
             g.mapping_rule_id::text AS mapping_rule_id,
             g.occurrences,
             av.id::text AS attribute_value_id,
             av.code AS attribute_value_code,
             COALESCE(NULLIF(avt.label,''),av.code) AS attribute_value_label
      FROM grouped g
      JOIN public.attribute_values av
        ON av.attribute_id=g.attribute_id::uuid AND av.active=true
      LEFT JOIN public.attribute_value_translations avt
        ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE (
        NOT EXISTS (
          SELECT 1
          FROM public.product_type_attribute_allowed_values allowed
          WHERE allowed.product_type_id=g.product_type_id::uuid
            AND allowed.attribute_id=g.attribute_id::uuid
        )
        OR EXISTS (
          SELECT 1
          FROM public.product_type_attribute_allowed_values allowed
          WHERE allowed.product_type_id=g.product_type_id::uuid
            AND allowed.attribute_id=g.attribute_id::uuid
            AND allowed.attribute_value_id=av.id
        )
      )
      ORDER BY g.occurrences DESC,g.source_name,g.source_attribute_key,g.source_value_key,
               av.sort_order,av.code,av.id
    `);

    const groups = new Map<string, {
      representativeSourceProductId: string;
      sourceName: string;
      sourceAttributeKey: string;
      sourceValue: string;
      sourceValueKey: string;
      scopeKind: "taxonomy_node" | "source_category";
      scopeKey: string;
      attributeId: string;
      attributeCode: string;
      productTypeId: string;
      productTypeCode: string;
      mappingRuleId: string;
      occurrences: number;
      options: CatalogueControlledValueOption[];
    }>();

    for (const row of result.rows) {
      const mappingRuleId = required(row.mapping_rule_id, "mapping rule.id");
      const sourceValueKey = required(row.source_value_key, "source value key");
      const groupKey = `${mappingRuleId}:${sourceValueKey}`;
      let item = groups.get(groupKey);
      if (!item) {
        const scopeKind = required(row.scope_kind, "mapping scope kind");
        if (scopeKind !== "taxonomy_node" && scopeKind !== "source_category") throw new Error("Unsupported controlled-value mapping scope");
        item = {
          representativeSourceProductId: required(row.representative_source_product_id, "representative source product"),
          sourceName: required(row.source_name, "source.name"),
          sourceAttributeKey: required(row.source_attribute_key, "source attribute key"),
          sourceValue: required(row.source_value, "source value"),
          sourceValueKey,
          scopeKind,
          scopeKey: required(row.scope_key, "mapping scope key"),
          attributeId: required(row.attribute_id, "attribute.id"),
          attributeCode: required(row.attribute_code, "attribute.code"),
          productTypeId: required(row.product_type_id, "product type.id"),
          productTypeCode: required(row.product_type_code, "product type.code"),
          mappingRuleId,
          occurrences: numberValue(row.occurrences),
          options: []
        };
        groups.set(groupKey, item);
      }
      item.options.push({
        id: required(row.attribute_value_id, "attribute value.id"),
        code: required(row.attribute_value_code, "attribute value.code"),
        label: required(row.attribute_value_label, "attribute value.label")
      });
    }

    return [...groups.values()];
  }, { readOnly: true, statementTimeoutMs: 12_000 });
}

function required(value: unknown, name: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}
function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Expected a non-negative controlled-value queue count");
  return parsed;
}

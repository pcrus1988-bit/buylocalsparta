import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueAttributeDefinitionOption = Readonly<{
  id: string;
  code: string;
  unit?: string;
  valueMode: string;
  groupCode?: string;
}>;

export type CatalogueSourceAttributeMappingResult = Readonly<{
  sourceProductId: string;
  sourceName: string;
  sourceAttributeKey: string;
  attributeId: string;
  attributeCode: string;
  mappedObservations: number;
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
      SELECT id::text AS id, code, unit, value_mode, group_code
      FROM public.attribute_definitions
      WHERE active=true
      ORDER BY COALESCE(group_code,''), code, id
      LIMIT 2000
    `);
    return result.rows.map((row) => ({
      id: required(row.id, "attribute.id"),
      code: required(row.code, "attribute.code"),
      unit: optional(row.unit),
      valueMode: required(row.value_mode, "attribute.value_mode"),
      groupCode: optional(row.group_code)
    }));
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

export async function mapCatalogueSourceAttribute(
  principal: SessionPrincipal,
  input: { sourceProductId: string; sourceAttributeKey: string; attributeId: string }
): Promise<CatalogueSourceAttributeMappingResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");

  const sourceProductId = input.sourceProductId.trim();
  const sourceAttributeKey = input.sourceAttributeKey.trim();
  const attributeId = input.attributeId.trim();
  if (!sourceProductId || !sourceAttributeKey || !attributeId) throw new Error("Source product, source attribute and canonical attribute are required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 30_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const contextResult = await tx.query<SqlRow>(`
      SELECT sp.source_id::text AS source_id,
             s.name AS source_name,
             count(a.id)::integer AS observations,
             count(a.id) FILTER (WHERE a.mapping_status='unmapped' AND a.attribute_id IS NULL)::integer AS unresolved
      FROM public.catalog_source_products sp
      JOIN public.catalog_sources s ON s.id=sp.source_id
      JOIN public.catalog_source_attribute_observations a
        ON a.source_product_id=sp.id
       AND a.source_attribute_key=$2::text
      WHERE sp.id=$1::uuid
      GROUP BY sp.source_id,s.name
      LIMIT 1
    `, [sourceProductId, sourceAttributeKey]);
    const context = contextResult.rows[0];
    if (!context) throw new Error("The selected source attribute observation was not found");
    if (numberValue(context.unresolved) < 1) throw new Error("This source attribute is no longer unresolved");

    const sourceId = required(context.source_id, "source.id");
    const targetResult = await tx.query<SqlRow>(`
      SELECT id::text AS id, code
      FROM public.attribute_definitions
      WHERE id=$1::uuid AND active=true
      LIMIT 1
    `, [attributeId]);
    const target = targetResult.rows[0];
    if (!target) throw new Error("The selected canonical attribute is missing or inactive");
    const attributeCode = required(target.code, "attribute.code");

    const conflictingMappedResult = await tx.query<SqlRow>(`
      SELECT a.attribute_id::text AS attribute_id, d.code AS attribute_code
      FROM public.catalog_source_attribute_observations a
      JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
      LEFT JOIN public.attribute_definitions d ON d.id=a.attribute_id
      WHERE sp.source_id=$1::uuid
        AND a.source_attribute_key=$2::text
        AND a.mapping_status='mapped'
        AND a.attribute_id IS NOT NULL
        AND a.attribute_id<>$3::uuid
      ORDER BY a.created_at ASC, a.id ASC
      LIMIT 1
    `, [sourceId, sourceAttributeKey, attributeId]);
    if (conflictingMappedResult.rowCount > 0) {
      const conflict = conflictingMappedResult.rows[0];
      throw new Error(`This source key already has mapped evidence for ${optional(conflict.attribute_code) ?? required(conflict.attribute_id, "conflicting attribute")}. Review the historical mapping before changing its meaning.`);
    }

    const existingRuleResult = await tx.query<SqlRow>(`
      SELECT id::text AS id, attribute_id::text AS attribute_id
      FROM public.catalog_source_attribute_mapping_rules
      WHERE source_id=$1::uuid AND source_attribute_key=$2::text
      FOR UPDATE
    `, [sourceId, sourceAttributeKey]);
    const existingRule = existingRuleResult.rows[0];
    if (existingRule && required(existingRule.attribute_id, "mapping rule attribute") !== attributeId) {
      throw new Error("A reusable rule already exists for this source key with a different canonical attribute. Explicit remapping is required before changing it.");
    }

    const ruleResult = await tx.query<SqlRow>(`
      INSERT INTO public.catalog_source_attribute_mapping_rules(
        source_id,source_attribute_key,attribute_id,mapping_method,reviewed_by,reviewed_at,is_active,metadata,created_at,updated_at
      )
      VALUES (
        $1::uuid,$2::text,$3::uuid,'admin_exact',$4::uuid,now(),true,
        jsonb_build_object('mappingVersion','source_attribute_key_v1','createdFromSourceProductId',$5::text),
        now(),now()
      )
      ON CONFLICT (source_id,source_attribute_key)
      DO UPDATE SET
        reviewed_by=EXCLUDED.reviewed_by,
        reviewed_at=now(),
        is_active=true,
        metadata=public.catalog_source_attribute_mapping_rules.metadata || EXCLUDED.metadata,
        updated_at=now()
      WHERE public.catalog_source_attribute_mapping_rules.attribute_id=EXCLUDED.attribute_id
      RETURNING id::text AS id
    `, [sourceId, sourceAttributeKey, attributeId, principal.userId, sourceProductId]);
    const ruleId = required(ruleResult.rows[0]?.id, "mapping rule.id");

    const mappedResult = await tx.query<SqlRow>(`
      UPDATE public.catalog_source_attribute_observations AS a
      SET attribute_id=$3::uuid,
          mapping_status='mapped',
          confidence=1,
          metadata=COALESCE(a.metadata,'{}'::jsonb) || jsonb_build_object(
            'mappingRuleId',$4::uuid,
            'mappingMethod','admin_exact_source_key',
            'mappedBy',$5::text,
            'mappedAt',now(),
            'backfilled',true
          )
      FROM public.catalog_source_products AS sp
      WHERE sp.id=a.source_product_id
        AND sp.source_id=$1::uuid
        AND a.source_attribute_key=$2::text
        AND a.mapping_status='unmapped'
        AND a.attribute_id IS NULL
      RETURNING a.id::text AS id
    `, [sourceId, sourceAttributeKey, attributeId, ruleId, principal.userId]);

    return {
      sourceProductId,
      sourceName: required(context.source_name, "source.name"),
      sourceAttributeKey,
      attributeId,
      attributeCode,
      mappedObservations: mappedResult.rowCount,
      ruleId
    };
  }, { statementTimeoutMs: 30_000 });
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

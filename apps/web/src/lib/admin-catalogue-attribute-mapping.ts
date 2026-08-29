import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueAttributeQueueStatus = "unmapped" | "review_required";

export type CatalogueAttributeDefinition = Readonly<{
  id: string;
  code: string;
  dataType: string;
  unit?: string;
}>;

export type CatalogueAttributeMappingGroup = Readonly<{
  sourceId: string;
  sourceName: string;
  sourceAttributeKey: string;
  sourceTaxonomyNodeId?: string;
  categoryPath?: string;
  sourceUnit?: string;
  observationCount: number;
  productCount: number;
  sampleValues: readonly unknown[];
  sampleProductKeys: readonly string[];
  suggestedAttributeId?: string;
  suggestedAttributeCode?: string;
}>;

export type CatalogueAttributeMappingWorkspace = Readonly<{
  csrfToken: string;
  snapshotId?: string;
  queueStatus: CatalogueAttributeQueueStatus;
  unresolvedObservations: number;
  unmappedObservations: number;
  reviewRequiredObservations: number;
  groupCount: number;
  affectedProducts: number;
  groups: readonly CatalogueAttributeMappingGroup[];
  definitions: readonly CatalogueAttributeDefinition[];
}>;

export type ResolveCatalogueAttributeMappingInput = Readonly<{
  sourceId: string;
  sourceAttributeKey: string;
  sourceTaxonomyNodeId?: string;
  sourceUnit?: string;
  decision: "mapped" | "review_required" | "rejected";
  attributeId?: string;
}>;

export type ResolveCatalogueAttributeMappingResult = Readonly<{
  decision: ResolveCatalogueAttributeMappingInput["decision"];
  affectedObservations: number;
  canonicalAttributeCode?: string;
}>;

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, {
    statementTimeoutMs: 20_000,
    lockTimeoutMs: 3_000
  });
}

export async function adminCatalogueAttributeMappingWorkspace(
  principal: SessionPrincipal,
  input: { snapshotId?: string; status?: CatalogueAttributeQueueStatus } = {}
): Promise<CatalogueAttributeMappingWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  const snapshotId = input.snapshotId?.trim() || undefined;
  const queueStatus: CatalogueAttributeQueueStatus = input.status === "review_required" ? "review_required" : "unmapped";

  if (!postgresAdminRuntimeEnabled()) {
    return {
      csrfToken: principal.csrfToken,
      snapshotId,
      queueStatus,
      unresolvedObservations: 0,
      unmappedObservations: 0,
      reviewRequiredObservations: 0,
      groupCount: 0,
      affectedProducts: 0,
      groups: [],
      definitions: []
    };
  }

  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const [metricsResult, groupsResult, definitionsResult] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT
          count(*) FILTER (WHERE a.mapping_status IN ('unmapped','review_required'))::integer AS unresolved_observations,
          count(*) FILTER (WHERE a.mapping_status='unmapped')::integer AS unmapped_observations,
          count(*) FILTER (WHERE a.mapping_status='review_required')::integer AS review_required_observations,
          count(DISTINCT (
            sp.source_id,
            public.catalog_attribute_mapping_key(a.source_attribute_key),
            coalesce(sp.source_taxonomy_node_id::text,''),
            public.catalog_attribute_mapping_key(a.source_unit)
          )) FILTER (WHERE a.mapping_status=$2)::integer AS group_count,
          count(DISTINCT sp.id) FILTER (WHERE a.mapping_status=$2)::integer AS affected_products
        FROM public.catalog_source_attribute_observations a
        JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
        WHERE ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
      `, [snapshotId ?? null, queueStatus]),
      tx.query<SqlRow>(`
        SELECT
          sp.source_id::text AS source_id,
          source.name AS source_name,
          a.source_attribute_key,
          sp.source_taxonomy_node_id::text AS source_taxonomy_node_id,
          COALESCE(NULLIF(array_to_string(node.path_labels,' › '),''),node.source_label) AS category_path,
          NULLIF(btrim(a.source_unit),'') AS source_unit,
          count(*)::integer AS observation_count,
          count(DISTINCT sp.id)::integer AS product_count,
          (array_agg(DISTINCT left(a.raw_value::text, 180)))[1:5] AS sample_values,
          (array_agg(DISTINCT sp.source_product_key))[1:5] AS sample_product_keys
        FROM public.catalog_source_attribute_observations a
        JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
        JOIN public.catalog_sources source ON source.id=sp.source_id
        LEFT JOIN public.catalog_source_taxonomy_nodes node ON node.id=sp.source_taxonomy_node_id
        WHERE a.mapping_status=$2
          AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
        GROUP BY sp.source_id,source.name,a.source_attribute_key,sp.source_taxonomy_node_id,node.path_labels,node.source_label,NULLIF(btrim(a.source_unit),'')
        ORDER BY count(*) DESC,source.name,a.source_attribute_key
        LIMIT 200
      `, [snapshotId ?? null, queueStatus]),
      tx.query<SqlRow>(`
        SELECT id::text AS id,code,data_type,unit
        FROM public.attribute_definitions
        ORDER BY code,id
      `)
    ]);

    const definitions = definitionsResult.rows.map((row) => ({
      id: required(row.id, "attribute.id"),
      code: required(row.code, "attribute.code"),
      dataType: required(row.data_type, "attribute.data_type"),
      unit: optional(row.unit)
    }));
    const definitionsBySuggestionKey = new Map<string, CatalogueAttributeDefinition>();
    for (const definition of definitions) {
      const key = suggestionKey(definition.code);
      if (key && !definitionsBySuggestionKey.has(key)) definitionsBySuggestionKey.set(key, definition);
    }

    const groups = groupsResult.rows.map((row) => {
      const sourceAttributeKey = required(row.source_attribute_key, "source_attribute_key");
      const suggested = definitionsBySuggestionKey.get(suggestionKey(sourceAttributeKey));
      return {
        sourceId: required(row.source_id, "source_id"),
        sourceName: required(row.source_name, "source_name"),
        sourceAttributeKey,
        sourceTaxonomyNodeId: optional(row.source_taxonomy_node_id),
        categoryPath: optional(row.category_path),
        sourceUnit: optional(row.source_unit),
        observationCount: integer(row.observation_count),
        productCount: integer(row.product_count),
        sampleValues: jsonTextArray(row.sample_values),
        sampleProductKeys: stringArray(row.sample_product_keys),
        suggestedAttributeId: suggested?.id,
        suggestedAttributeCode: suggested?.code
      } satisfies CatalogueAttributeMappingGroup;
    });

    const metrics = metricsResult.rows[0];
    return {
      csrfToken: principal.csrfToken,
      snapshotId,
      queueStatus,
      unresolvedObservations: integer(metrics?.unresolved_observations),
      unmappedObservations: integer(metrics?.unmapped_observations),
      reviewRequiredObservations: integer(metrics?.review_required_observations),
      groupCount: integer(metrics?.group_count),
      affectedProducts: integer(metrics?.affected_products),
      groups,
      definitions
    };
  }, { readOnly: true, statementTimeoutMs: 20_000 });
}

export async function resolveCatalogueAttributeMapping(
  principal: SessionPrincipal,
  input: ResolveCatalogueAttributeMappingInput
): Promise<ResolveCatalogueAttributeMappingResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");

  const sourceId = input.sourceId.trim();
  const sourceAttributeKey = input.sourceAttributeKey.trim();
  const sourceTaxonomyNodeId = input.sourceTaxonomyNodeId?.trim() || null;
  const sourceUnit = input.sourceUnit?.trim() || null;
  const decision = input.decision;
  const attributeId = input.attributeId?.trim() || null;

  if (!sourceId || !sourceAttributeKey) throw new Error("Catalogue source and source attribute key are required");
  if (!(["mapped", "review_required", "rejected"] as const).includes(decision)) throw new Error("Unsupported attribute mapping decision");
  if (decision === "mapped" && !attributeId) throw new Error("Choose a canonical attribute before mapping");

  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const validation = await tx.query<SqlRow>(`
      SELECT
        EXISTS(SELECT 1 FROM public.catalog_sources WHERE id=$1::uuid) AS source_exists,
        CASE WHEN $2::uuid IS NULL THEN true ELSE EXISTS(SELECT 1 FROM public.attribute_definitions WHERE id=$2::uuid) END AS attribute_exists,
        CASE WHEN $3::uuid IS NULL THEN true ELSE EXISTS(
          SELECT 1 FROM public.catalog_source_taxonomy_nodes WHERE id=$3::uuid AND source_id=$1::uuid
        ) END AS taxonomy_exists,
        (SELECT code FROM public.attribute_definitions WHERE id=$2::uuid) AS attribute_code
    `, [sourceId, attributeId, sourceTaxonomyNodeId]);
    const row = validation.rows[0];
    if (row?.source_exists !== true) throw new Error("Catalogue source no longer exists");
    if (row?.attribute_exists !== true) throw new Error("Canonical attribute no longer exists");
    if (row?.taxonomy_exists !== true) throw new Error("Supplier taxonomy context no longer exists");
    const canonicalAttributeCode = optional(row?.attribute_code);

    await tx.query(`
      INSERT INTO public.catalog_source_attribute_mapping_rules (
        source_id,source_attribute_key,source_taxonomy_node_id,source_unit,attribute_id,mapping_status,decided_by
      )
      VALUES (
        $1::uuid,$2,$3::uuid,$4,
        CASE WHEN $5::text='mapped' THEN $6::uuid ELSE NULL END,
        $5,$7::uuid
      )
      ON CONFLICT (
        source_id,source_attribute_key_normalized,source_taxonomy_node_key,source_unit_normalized
      ) DO UPDATE SET
        source_attribute_key=EXCLUDED.source_attribute_key,
        source_taxonomy_node_id=EXCLUDED.source_taxonomy_node_id,
        source_unit=EXCLUDED.source_unit,
        attribute_id=EXCLUDED.attribute_id,
        mapping_status=EXCLUDED.mapping_status,
        decided_by=EXCLUDED.decided_by,
        updated_at=now()
    `, [sourceId, sourceAttributeKey, sourceTaxonomyNodeId, sourceUnit, decision, attributeId, principal.userId]);

    const updated = await tx.query<SqlRow>(`
      WITH changed AS (
        UPDATE public.catalog_source_attribute_observations a
        SET
          attribute_id=CASE WHEN $5::text='mapped' THEN $6::uuid ELSE NULL END,
          mapping_status=$5
        FROM public.catalog_source_products sp
        WHERE a.source_product_id=sp.id
          AND sp.source_id=$1::uuid
          AND public.catalog_attribute_mapping_key(a.source_attribute_key)=public.catalog_attribute_mapping_key($2)
          AND coalesce(sp.source_taxonomy_node_id::text,'')=coalesce(($3::uuid)::text,'')
          AND public.catalog_attribute_mapping_key(a.source_unit)=public.catalog_attribute_mapping_key($4)
          AND a.mapping_status IN ('unmapped','review_required')
        RETURNING a.id
      )
      SELECT count(*)::integer AS affected_observations FROM changed
    `, [sourceId, sourceAttributeKey, sourceTaxonomyNodeId, sourceUnit, decision, attributeId]);

    return {
      decision,
      affectedObservations: integer(updated.rows[0]?.affected_observations),
      canonicalAttributeCode: decision === "mapped" ? canonicalAttributeCode : undefined
    };
  }, { isolation: "serializable", statementTimeoutMs: 20_000 });
}

function suggestionKey(value: string): string {
  return value.trim().toLocaleLowerCase("el-GR").replace(/[\s_.:/-]+/g, "");
}

function required(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`Missing ${field}`);
  return text;
}

function optional(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean).slice(0, 5);
}

function jsonTextArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item) => {
    if (typeof item !== "string") return item;
    try { return JSON.parse(item); } catch { return item; }
  });
}

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueAttributeReviewSuggestion = Readonly<{
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  attributeId: string;
  attributeCode: string;
  dataType: string;
  unit?: string;
  score: number;
  reasons: readonly string[];
}>;

export type CatalogueAttributeReviewSample = Readonly<{
  productId: string;
  productKey: string;
  title: string;
  rawValue: unknown;
  sourceUnit?: string;
}>;

export type CatalogueUnmappedAttributeGroup = Readonly<{
  sourceId: string;
  sourceName: string;
  sourceAttributeKey: string;
  scopeKind: "taxonomy_node" | "source_category" | "unscoped";
  scopeKey?: string;
  contextLabel: string;
  approvedCategoryCode?: string;
  observationCount: number;
  productCount: number;
  sourceUnits: readonly string[];
  representativeProductId: string;
  samples: readonly CatalogueAttributeReviewSample[];
  suggestions: readonly CatalogueAttributeReviewSuggestion[];
  actionable: boolean;
  blocker?: string;
}>;

export type CatalogueAttributeReviewWorkspace = Readonly<{
  csrfToken: string;
  snapshotId?: string;
  totalUnmapped: number;
  groupCount: number;
  actionableGroups: number;
  blockedGroups: number;
  groups: readonly CatalogueUnmappedAttributeGroup[];
}>;

type RawGroup = Readonly<{
  sourceId: string;
  sourceName: string;
  sourceAttributeKey: string;
  scopeKind: "taxonomy_node" | "source_category" | "unscoped";
  scopeKey?: string;
  contextLabel: string;
  approvedCategoryCode?: string;
  allowedProductTypeIds: readonly string[];
  observationCount: number;
  productCount: number;
  sourceUnits: readonly string[];
  representativeProductId: string;
  samples: readonly CatalogueAttributeReviewSample[];
}>;

type Target = Readonly<{
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  attributeId: string;
  attributeCode: string;
  dataType: string;
  unit?: string;
  labels: readonly string[];
}>;

type HistoricalRule = Readonly<{
  sourceId: string;
  sourceAttributeKey: string;
  productTypeId: string;
  attributeId: string;
  count: number;
}>;

export async function adminCatalogueAttributeReviewWorkspace(
  principal: SessionPrincipal,
  input: { snapshotId?: string } = {}
): Promise<CatalogueAttributeReviewWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  const snapshotId = input.snapshotId?.trim() || undefined;
  if (!postgresAdminRuntimeEnabled()) {
    return { csrfToken: principal.csrfToken, snapshotId, totalUnmapped: 0, groupCount: 0, actionableGroups: 0, blockedGroups: 0, groups: [] };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [groupRows, targetRows, historyRows, totalRows] = await Promise.all([
      tx.query<SqlRow>(`
        WITH base AS (
          SELECT a.id,
                 a.source_product_id,
                 a.source_attribute_key,
                 NULLIF(btrim(a.source_unit),'') AS source_unit,
                 a.raw_value,
                 a.created_at,
                 sp.snapshot_id,
                 sp.source_id,
                 sp.source_taxonomy_node_id,
                 sp.source_product_key,
                 sp.title,
                 s.name AS source_name,
                 COALESCE(
                   NULLIF(btrim(sp.source_identity->>'categoryId'),''),
                   NULLIF(btrim(sp.source_identity->>'category_id'),''),
                   NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')
                 ) AS provider_category,
                 t.path_labels,
                 m.category_id AS approved_category_id,
                 c.code AS approved_category_code
          FROM public.catalog_source_attribute_observations a
          JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
          JOIN public.catalog_sources s ON s.id=sp.source_id
          LEFT JOIN public.catalog_source_taxonomy_nodes t ON t.id=sp.source_taxonomy_node_id
          LEFT JOIN public.catalog_source_category_mappings m
            ON m.source_taxonomy_node_id=sp.source_taxonomy_node_id
           AND m.mapping_status='approved'
          LEFT JOIN public.categories c ON c.id=m.category_id
          WHERE a.mapping_status='unmapped'
            AND a.attribute_id IS NULL
            AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
        ), scoped AS (
          SELECT b.*,
                 CASE
                   WHEN b.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node'
                   WHEN b.provider_category IS NOT NULL THEN 'source_category'
                   ELSE 'unscoped'
                 END AS scope_kind,
                 CASE
                   WHEN b.source_taxonomy_node_id IS NOT NULL THEN b.source_taxonomy_node_id::text
                   WHEN b.provider_category IS NOT NULL THEN b.provider_category
                   ELSE NULL
                 END AS scope_key,
                 CASE
                   WHEN b.source_taxonomy_node_id IS NOT NULL THEN COALESCE(NULLIF(array_to_string(b.path_labels,' › '),''),'Supplier taxonomy node')
                   WHEN b.provider_category IS NOT NULL THEN 'Provider category · ' || b.provider_category
                   ELSE 'No stable source category'
                 END AS context_label
          FROM base b
        ), grouped AS (
          SELECT source_id,source_name,source_attribute_key,scope_kind,scope_key,context_label,
                 approved_category_id,approved_category_code,
                 count(*)::integer AS observation_count,
                 count(DISTINCT source_product_id)::integer AS product_count,
                 array_remove(array_agg(DISTINCT source_unit ORDER BY source_unit),NULL) AS source_units,
                 min(source_product_id::text) AS representative_product_id
          FROM scoped
          GROUP BY source_id,source_name,source_attribute_key,scope_kind,scope_key,context_label,
                   approved_category_id,approved_category_code
        )
        SELECT g.source_id::text AS source_id,
               g.source_name,g.source_attribute_key,g.scope_kind,g.scope_key,g.context_label,
               g.approved_category_code,g.observation_count,g.product_count,g.source_units,
               g.representative_product_id,
               COALESCE((
                 SELECT array_agg(cpt.product_type_id::text ORDER BY cpt.sort_order,cpt.product_type_id::text)
                 FROM public.category_product_types cpt
                 WHERE cpt.category_id=g.approved_category_id
               ),ARRAY[]::text[]) AS allowed_product_type_ids,
               COALESCE((
                 SELECT jsonb_agg(sample.payload ORDER BY sample.created_at,sample.id)
                 FROM (
                   SELECT jsonb_build_object(
                            'productId',s2.source_product_id::text,
                            'productKey',s2.source_product_key,
                            'title',s2.title,
                            'rawValue',s2.raw_value,
                            'sourceUnit',s2.source_unit
                          ) AS payload,
                          s2.created_at,s2.id
                   FROM scoped s2
                   WHERE s2.source_id=g.source_id
                     AND s2.source_attribute_key=g.source_attribute_key
                     AND s2.scope_kind=g.scope_kind
                     AND s2.scope_key IS NOT DISTINCT FROM g.scope_key
                   ORDER BY s2.created_at,s2.id
                   LIMIT 5
                 ) sample
               ),'[]'::jsonb) AS samples
        FROM grouped g
        ORDER BY g.observation_count DESC,g.source_name,g.context_label,g.source_attribute_key
        LIMIT 180
      `, [snapshotId ?? null]),
      tx.query<SqlRow>(`
        SELECT pt.id::text AS product_type_id,
               pt.code AS product_type_code,
               COALESCE(NULLIF(ptt.name,''),pt.code) AS product_type_name,
               ad.id::text AS attribute_id,
               ad.code AS attribute_code,
               ad.data_type,
               COALESCE(pta.unit_override,ad.unit) AS effective_unit,
               COALESCE(array_agg(DISTINCT NULLIF(btrim(at.label),'')) FILTER (WHERE at.label IS NOT NULL),ARRAY[]::text[]) AS labels
        FROM public.product_type_attributes pta
        JOIN public.product_types pt ON pt.id=pta.product_type_id AND pt.status='active'
        JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
        LEFT JOIN public.product_type_translations ptt ON ptt.product_type_id=pt.id AND upper(ptt.locale)='EL'
        LEFT JOIN public.attribute_translations at ON at.attribute_id=ad.id AND upper(at.locale) IN ('EL','EN')
        GROUP BY pt.id,pt.code,ptt.name,ad.id,ad.code,ad.data_type,pta.unit_override,ad.unit,pta.sort_order
        ORDER BY pt.code,pta.sort_order,ad.code,ad.id
        LIMIT 5000
      `),
      tx.query<SqlRow>(`
        SELECT source_id::text AS source_id,source_attribute_key,
               product_type_id::text AS product_type_id,attribute_id::text AS attribute_id,
               count(*)::integer AS rule_count
        FROM public.catalog_source_attribute_mapping_rules
        WHERE status='approved'
        GROUP BY source_id,source_attribute_key,product_type_id,attribute_id
        ORDER BY rule_count DESC
        LIMIT 5000
      `),
      tx.query<SqlRow>(`
        SELECT count(*)::integer AS total
        FROM public.catalog_source_attribute_observations a
        JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
        WHERE a.mapping_status='unmapped' AND a.attribute_id IS NULL
          AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
      `, [snapshotId ?? null])
    ]);

    const groups = groupRows.rows.map(mapGroup);
    const targets = targetRows.rows.map(mapTarget);
    const historical = historyRows.rows.map(mapHistory);
    const scored = buildSuggestions(groups, targets, historical);
    return {
      csrfToken: principal.csrfToken,
      snapshotId,
      totalUnmapped: integer(totalRows.rows[0]?.total),
      groupCount: scored.length,
      actionableGroups: scored.filter((group) => group.actionable).length,
      blockedGroups: scored.filter((group) => !group.actionable).length,
      groups: scored
    };
  }, { readOnly: true, statementTimeoutMs: 20_000 });
}

function buildSuggestions(groups: readonly RawGroup[], targets: readonly Target[], history: readonly HistoricalRule[]): CatalogueUnmappedAttributeGroup[] {
  const exactIndex = new Map<string, Target[]>();
  const tokenIndex = new Map<string, Target[]>();
  const unitIndex = new Map<string, Target[]>();
  const historyIndex = new Map<string, HistoricalRule[]>();

  for (const target of targets) {
    for (const label of [target.attributeCode, ...target.labels]) {
      const normalized = normalize(label);
      if (!normalized) continue;
      pushIndex(exactIndex, normalized, target);
      for (const token of tokens(normalized)) pushIndex(tokenIndex, token, target);
    }
    if (target.unit) pushIndex(unitIndex, normalizeUnit(target.unit), target);
  }
  for (const item of history) pushIndex(historyIndex, `${item.sourceId}|${item.sourceAttributeKey}`, item);

  return groups.map((group) => {
    const allowed = new Set(group.allowedProductTypeIds);
    const sourceKey = normalize(group.sourceAttributeKey);
    const pool = new Map<string, Target>();
    const add = (target: Target) => {
      if (group.scopeKind === "taxonomy_node" && !allowed.has(target.productTypeId)) return;
      pool.set(`${target.productTypeId}:${target.attributeId}`, target);
    };

    for (const target of exactIndex.get(sourceKey) ?? []) add(target);
    for (const token of tokens(sourceKey)) for (const target of tokenIndex.get(token) ?? []) add(target);
    for (const unit of group.sourceUnits) for (const target of unitIndex.get(normalizeUnit(unit)) ?? []) add(target);

    const historical = historyIndex.get(`${group.sourceId}|${group.sourceAttributeKey}`) ?? [];
    const historicalKeys = new Set<string>();
    for (const item of historical) {
      historicalKeys.add(`${item.productTypeId}:${item.attributeId}`);
      const target = targets.find((candidate) => candidate.productTypeId === item.productTypeId && candidate.attributeId === item.attributeId);
      if (target) add(target);
    }

    const suggestions = [...pool.values()]
      .map((target) => score(group, target, historicalKeys))
      .filter((candidate) => candidate.score >= 0.36)
      .sort((a, b) => b.score - a.score || a.productTypeName.localeCompare(b.productTypeName) || a.attributeCode.localeCompare(b.attributeCode))
      .slice(0, 5);

    let blocker: string | undefined;
    if (group.scopeKind === "unscoped") blocker = "A stable supplier/provider category is required before a reusable mapping can be approved.";
    else if (group.scopeKind === "taxonomy_node" && !group.approvedCategoryCode) blocker = "Approve the supplier taxonomy → KONTAMOU category mapping first.";
    else if (group.scopeKind === "taxonomy_node" && group.allowedProductTypeIds.length === 0) blocker = "The approved category has no active Product Type contract yet.";

    return {
      sourceId: group.sourceId,
      sourceName: group.sourceName,
      sourceAttributeKey: group.sourceAttributeKey,
      scopeKind: group.scopeKind,
      scopeKey: group.scopeKey,
      contextLabel: group.contextLabel,
      approvedCategoryCode: group.approvedCategoryCode,
      observationCount: group.observationCount,
      productCount: group.productCount,
      sourceUnits: group.sourceUnits,
      representativeProductId: group.representativeProductId,
      samples: group.samples,
      suggestions,
      actionable: !blocker,
      blocker
    };
  });
}

function score(group: RawGroup, target: Target, historicalKeys: ReadonlySet<string>): CatalogueAttributeReviewSuggestion {
  const sourceKey = normalize(group.sourceAttributeKey);
  const labels = [target.attributeCode, ...target.labels].map(normalize).filter(Boolean);
  const reasons: string[] = [];
  let value = 0;

  if (labels.includes(sourceKey)) {
    value += 0.62;
    reasons.push("Exact normalized key/label match");
  } else {
    const similarity = Math.max(0, ...labels.map((label) => blendedSimilarity(sourceKey, label)));
    value += similarity * 0.46;
    if (similarity >= 0.55) reasons.push(`Key similarity ${Math.round(similarity * 100)}%`);
  }

  if (historicalKeys.has(`${target.productTypeId}:${target.attributeId}`)) {
    value += 0.20;
    reasons.push("Previously approved for this source key in another exact context");
  }

  const sourceUnits = group.sourceUnits.map(normalizeUnit).filter(Boolean);
  const canonicalUnit = normalizeUnit(target.unit);
  if (sourceUnits.length && canonicalUnit && sourceUnits.includes(canonicalUnit)) {
    value += 0.12;
    reasons.push(`Unit agrees (${target.unit})`);
  } else if (sourceUnits.length && canonicalUnit && !sourceUnits.includes(canonicalUnit)) {
    value -= 0.10;
    reasons.push("Observed unit differs; value review would be required");
  }

  const inferred = inferValueType(group.samples.map((sample) => sample.rawValue));
  if (inferred && compatible(inferred, target.dataType)) {
    value += 0.06;
    reasons.push(`Samples fit ${target.dataType}`);
  } else if (inferred) {
    value -= 0.08;
    reasons.push(`Samples may not fit ${target.dataType}`);
  }

  return {
    productTypeId: target.productTypeId,
    productTypeCode: target.productTypeCode,
    productTypeName: target.productTypeName,
    attributeId: target.attributeId,
    attributeCode: target.attributeCode,
    dataType: target.dataType,
    unit: target.unit,
    score: clamp(value),
    reasons: reasons.slice(0, 4)
  };
}

function mapGroup(row: SqlRow): RawGroup {
  const scopeKind = String(row.scope_kind) as RawGroup["scopeKind"];
  return {
    sourceId: required(row.source_id, "source.id"),
    sourceName: required(row.source_name, "source.name"),
    sourceAttributeKey: required(row.source_attribute_key, "source attribute key"),
    scopeKind,
    scopeKey: optional(row.scope_key),
    contextLabel: required(row.context_label, "context label"),
    approvedCategoryCode: optional(row.approved_category_code),
    allowedProductTypeIds: stringArray(row.allowed_product_type_ids),
    observationCount: integer(row.observation_count),
    productCount: integer(row.product_count),
    sourceUnits: stringArray(row.source_units),
    representativeProductId: required(row.representative_product_id, "representative product"),
    samples: jsonArray(row.samples).map((item) => {
      const record = object(item);
      return {
        productId: required(record.productId, "sample product.id"),
        productKey: required(record.productKey, "sample product.key"),
        title: required(record.title, "sample product.title"),
        rawValue: record.rawValue,
        sourceUnit: optional(record.sourceUnit)
      };
    })
  };
}

function mapTarget(row: SqlRow): Target {
  return {
    productTypeId: required(row.product_type_id, "product type.id"),
    productTypeCode: required(row.product_type_code, "product type.code"),
    productTypeName: required(row.product_type_name, "product type.name"),
    attributeId: required(row.attribute_id, "attribute.id"),
    attributeCode: required(row.attribute_code, "attribute.code"),
    dataType: required(row.data_type, "attribute.data_type"),
    unit: optional(row.effective_unit),
    labels: stringArray(row.labels)
  };
}

function mapHistory(row: SqlRow): HistoricalRule {
  return {
    sourceId: required(row.source_id, "history source.id"),
    sourceAttributeKey: required(row.source_attribute_key, "history key"),
    productTypeId: required(row.product_type_id, "history product type.id"),
    attributeId: required(row.attribute_id, "history attribute.id"),
    count: integer(row.rule_count)
  };
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function normalizeUnit(value?: string): string { return value?.trim().toLocaleLowerCase("en") ?? ""; }
function tokens(value: string): readonly string[] { return [...new Set(value.split(/\s+/).filter((token) => token.length >= 2))]; }
function blendedSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  const jaccard = union ? intersection / union : 0;
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  return clamp(jaccard * 0.62 + Math.max(0, edit) * 0.38);
}
function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const left = previous[j - 1];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(above + 1, left + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length];
}
function inferValueType(values: readonly unknown[]): "number" | "boolean" | "text" | undefined {
  const scalars = values.map(unwrap).filter((value) => value !== undefined && value !== null);
  if (!scalars.length) return undefined;
  if (scalars.every((value) => typeof value === "number" || (typeof value === "string" && /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value.trim())))) return "number";
  if (scalars.every((value) => typeof value === "boolean" || (typeof value === "string" && /^(?:true|false|yes|no|1|0|ναι|οχι|όχι)$/iu.test(value.trim())))) return "boolean";
  return "text";
}
function unwrap(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const nested = record.value;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) return (nested as Record<string, unknown>).value ?? nested;
    return nested ?? record.rawValue ?? value;
  }
  return value;
}
function compatible(inferred: "number" | "boolean" | "text", dataType: string): boolean {
  if (inferred === "number") return dataType === "number" || dataType === "dimension" || dataType === "text";
  if (inferred === "boolean") return dataType === "boolean" || dataType === "text";
  return dataType === "text" || dataType === "enum" || dataType === "multienum";
}
function clamp(value: number): number { return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000)); }
function pushIndex<T>(map: Map<string, T[]>, key: string, value: T): void {
  const current = map.get(key);
  if (current) current.push(value); else map.set(key, [value]);
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
function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Expected non-negative database integer");
  return parsed;
}
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []; }
function jsonArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

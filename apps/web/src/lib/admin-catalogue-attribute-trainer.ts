import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AttributeTrainerSuggestion = Readonly<{
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  attributeId: string;
  attributeCode: string;
  dataType: string;
  unit?: string;
  groupCode?: string;
  score: number;
  reasons: readonly string[];
}>;

export type AttributeTrainerSample = Readonly<{
  productId: string;
  productKey: string;
  title: string;
  rawValue: unknown;
  sourceUnit?: string;
}>;

export type AttributeTrainerCard = Readonly<{
  id: string;
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
  samples: readonly AttributeTrainerSample[];
  suggestions: readonly AttributeTrainerSuggestion[];
  actionable: boolean;
  blocker?: string;
}>;

export type AttributeTrainerTarget = Readonly<{
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  attributeId: string;
  attributeCode: string;
  dataType: string;
  unit?: string;
  groupCode?: string;
}>;

export type AttributeTrainerWorkspace = Readonly<{
  csrfToken: string;
  snapshotId?: string;
  totalUnmapped: number;
  unresolvedGroups: number;
  cards: readonly AttributeTrainerCard[];
  targets: readonly AttributeTrainerTarget[];
}>;

export type CreateAttributeTrainerTargetResult = Readonly<{
  attributeId: string;
  attributeCode: string;
  labelEl: string;
  dataType: string;
  productTypeId: string;
  productTypeCode: string;
  valueLevel: "family" | "variant";
  createdAttribute: boolean;
  createdBinding: boolean;
}>;

type RawCard = Omit<AttributeTrainerCard, "id" | "suggestions" | "actionable" | "blocker">;
type TargetInternal = AttributeTrainerTarget & Readonly<{ labels: readonly string[] }>;
type HistoricalRule = Readonly<{ sourceId: string; sourceAttributeKey: string; productTypeId: string; attributeId: string }>;

const CREATE_DATA_TYPES = ["boolean", "dimension", "enum", "multienum", "number", "text"] as const;
const CREATE_VALUE_LEVELS = ["family", "variant"] as const;

export async function createAttributeTrainerTarget(
  principal: SessionPrincipal,
  input: {
    sourceProductId: string;
    sourceAttributeKey: string;
    productTypeId: string;
    labelEl: string;
    dataType: string;
    valueLevel: string;
  }
): Promise<CreateAttributeTrainerTargetResult> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");

  const sourceProductId = input.sourceProductId.trim();
  const sourceAttributeKey = input.sourceAttributeKey.trim();
  const productTypeId = input.productTypeId.trim();
  const labelEl = input.labelEl.trim().replace(/\s+/g, " ");
  const dataType = input.dataType.trim() as (typeof CREATE_DATA_TYPES)[number];
  const valueLevel = input.valueLevel.trim() as (typeof CREATE_VALUE_LEVELS)[number];
  if (!sourceProductId || !sourceAttributeKey || !productTypeId || !labelEl) {
    throw new Error("Source product, source attribute, Product Type and canonical attribute name are required");
  }
  if (labelEl.length < 2 || labelEl.length > 120) throw new Error("Canonical attribute name must be 2–120 characters");
  if (!CREATE_DATA_TYPES.includes(dataType)) throw new Error("Invalid canonical attribute data type");
  if (!CREATE_VALUE_LEVELS.includes(valueLevel)) throw new Error("Invalid Product Type value level");

  const attributeCode = canonicalCode(labelEl);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const sourceContext = await tx.query<SqlRow>(`
      SELECT sp.source_taxonomy_node_id::text AS taxonomy_node_id,
             m.category_id::text AS approved_category_id
      FROM public.catalog_source_products sp
      LEFT JOIN public.catalog_source_category_mappings m
        ON m.source_taxonomy_node_id=sp.source_taxonomy_node_id
       AND m.mapping_status='approved'
      WHERE sp.id=$1::uuid
        AND EXISTS (
          SELECT 1 FROM public.catalog_source_attribute_observations a
          WHERE a.source_product_id=sp.id
            AND a.source_attribute_key=$2
            AND a.mapping_status='unmapped'
            AND a.attribute_id IS NULL
        )
      LIMIT 1
    `, [sourceProductId, sourceAttributeKey]);
    const context = sourceContext.rows[0];
    if (!context) throw new Error("The selected source attribute is no longer unresolved");

    const taxonomyNodeId = optional(context.taxonomy_node_id);
    const approvedCategoryId = optional(context.approved_category_id);
    if (taxonomyNodeId && !approvedCategoryId) {
      throw new Error("Approve the supplier taxonomy → KONTAMOU category mapping before creating a reusable attribute");
    }

    const productTypeResult = await tx.query<SqlRow>(`
      SELECT pt.id::text AS product_type_id, pt.code AS product_type_code
      FROM public.product_types pt
      WHERE pt.id=$1::uuid AND pt.status='active'
      LIMIT 1
    `, [productTypeId]);
    const productType = productTypeResult.rows[0];
    if (!productType) throw new Error("The selected Product Type is not active");
    const productTypeCode = required(productType.product_type_code, "product type.code");

    if (approvedCategoryId) {
      const allowed = await tx.query<SqlRow>(`
        SELECT 1 AS allowed
        FROM public.category_product_types
        WHERE category_id=$1::uuid AND product_type_id=$2::uuid
        LIMIT 1
      `, [approvedCategoryId, productTypeId]);
      if (!allowed.rowCount) throw new Error(`Product Type ${productTypeCode} is not allowed for the approved category`);
    }

    const existing = await tx.query<SqlRow>(`
      SELECT ad.id::text AS attribute_id, ad.code AS attribute_code, ad.data_type, ad.active
      FROM public.attribute_definitions ad
      WHERE ad.code=$1
         OR EXISTS (
           SELECT 1
           FROM public.attribute_translations at
           WHERE at.attribute_id=ad.id
             AND lower(btrim(at.label))=lower(btrim($2))
         )
      ORDER BY (ad.code=$1) DESC, ad.active DESC, ad.id
      LIMIT 1
      FOR UPDATE
    `, [attributeCode, labelEl]);

    let attributeId: string;
    let resolvedCode: string;
    let resolvedDataType: string;
    let createdAttribute = false;
    const existingAttribute = existing.rows[0];
    if (existingAttribute) {
      if (existingAttribute.active !== true) {
        throw new Error("A canonical attribute with this name/code already exists but is inactive. Reactivate it in Catalogue Structure instead of creating a duplicate.");
      }
      attributeId = required(existingAttribute.attribute_id, "attribute.id");
      resolvedCode = required(existingAttribute.attribute_code, "attribute.code");
      resolvedDataType = required(existingAttribute.data_type, "attribute.data_type");
    } else {
      const valueMode = dataType === "enum" || dataType === "multienum" ? "controlled" : "free";
      const inserted = await tx.query<SqlRow>(`
        INSERT INTO public.attribute_definitions(
          code,data_type,value_mode,active,filterable,variant_identity
        ) VALUES ($1,$2,$3,true,false,false)
        RETURNING id::text AS attribute_id,code AS attribute_code,data_type
      `, [attributeCode, dataType, valueMode]);
      const row = inserted.rows[0];
      attributeId = required(row?.attribute_id, "attribute.id");
      resolvedCode = required(row?.attribute_code, "attribute.code");
      resolvedDataType = required(row?.data_type, "attribute.data_type");
      createdAttribute = true;
    }

    await tx.query(`
      INSERT INTO public.attribute_translations(attribute_id,locale,label)
      VALUES($1::uuid,'el',$2)
      ON CONFLICT(attribute_id,locale) DO NOTHING
    `, [attributeId, labelEl]);

    const existingBinding = await tx.query<SqlRow>(`
      SELECT value_level
      FROM public.product_type_attributes
      WHERE product_type_id=$1::uuid AND attribute_id=$2::uuid
      FOR UPDATE
    `, [productTypeId, attributeId]);
    let createdBinding = false;
    let resolvedValueLevel = valueLevel;
    if (existingBinding.rowCount) {
      const stored = required(existingBinding.rows[0]?.value_level, "product type attribute.value_level");
      if (!CREATE_VALUE_LEVELS.includes(stored as (typeof CREATE_VALUE_LEVELS)[number])) {
        throw new Error("Existing Product Type attribute binding has an unsupported value level");
      }
      resolvedValueLevel = stored as (typeof CREATE_VALUE_LEVELS)[number];
    } else {
      await tx.query(`
        INSERT INTO public.product_type_attributes(
          product_type_id,attribute_id,requirement_level,value_level,
          filterable,searchable,customer_visible,comparable,variant_defining,
          allow_multiple,sort_order,variant_axis_order,unit_override
        )
        SELECT $1::uuid,$2::uuid,'optional',$3,
               false,false,true,false,false,
               $4,
               COALESCE(MAX(sort_order),-10)+10,
               NULL,NULL
        FROM public.product_type_attributes
        WHERE product_type_id=$1::uuid
      `, [productTypeId, attributeId, valueLevel, resolvedDataType === "multienum"]);
      createdBinding = true;
    }

    return {
      attributeId,
      attributeCode: resolvedCode,
      labelEl,
      dataType: resolvedDataType,
      productTypeId,
      productTypeCode,
      valueLevel: resolvedValueLevel,
      createdAttribute,
      createdBinding
    } satisfies CreateAttributeTrainerTargetResult;
  }, { isolation: "serializable", statementTimeoutMs: 20_000 });

  await recordAdminAudit(
    principal,
    "catalogue.attribute_trainer.target_created",
    "attribute_definition",
    result.attributeId,
    `Attribute Trainer: ${result.createdAttribute ? "created" : "reused"} ${result.attributeCode} for ${result.productTypeCode}`,
    {
      sourceProductId,
      sourceAttributeKey,
      productTypeId: result.productTypeId,
      productTypeCode: result.productTypeCode,
      attributeCode: result.attributeCode,
      labelEl: result.labelEl,
      dataType: result.dataType,
      valueLevel: result.valueLevel,
      createdAttribute: result.createdAttribute,
      createdBinding: result.createdBinding
    }
  );
  return result;
}

export async function adminCatalogueAttributeTrainerWorkspace(
  principal: SessionPrincipal,
  input: { snapshotId?: string; limit?: number } = {}
): Promise<AttributeTrainerWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  const snapshotId = input.snapshotId?.trim() || undefined;
  const limit = Math.max(6, Math.min(30, Math.trunc(input.limit ?? 18)));
  if (!postgresAdminRuntimeEnabled()) {
    return { csrfToken: principal.csrfToken, snapshotId, totalUnmapped: 0, unresolvedGroups: 0, cards: [], targets: [] };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const cardResult = await tx.query<SqlRow>(`
      WITH base AS (
        SELECT a.source_product_id,
               a.source_attribute_key,
               NULLIF(btrim(a.source_unit),'') AS source_unit,
               sp.source_id,
               sp.source_taxonomy_node_id,
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
      ), ranked AS (
        SELECT g.*,
               sum(g.observation_count) OVER ()::integer AS total_unmapped,
               count(*) OVER ()::integer AS unresolved_groups
        FROM grouped g
      ), top_groups AS (
        SELECT *
        FROM ranked
        ORDER BY observation_count DESC,product_count DESC,source_name,source_attribute_key
        LIMIT $2::integer
      )
      SELECT g.source_id::text AS source_id,
             g.source_name,g.source_attribute_key,g.scope_kind,g.scope_key,g.context_label,
             g.approved_category_code,g.observation_count,g.product_count,g.source_units,
             g.representative_product_id,g.total_unmapped,g.unresolved_groups,
             COALESCE((
               SELECT array_agg(cpt.product_type_id::text ORDER BY cpt.sort_order,cpt.product_type_id::text)
               FROM public.category_product_types cpt
               WHERE cpt.category_id=g.approved_category_id
             ),ARRAY[]::text[]) AS allowed_product_type_ids,
             COALESCE((
               SELECT jsonb_agg(sample.payload ORDER BY sample.created_at,sample.id)
               FROM (
                 SELECT jsonb_build_object(
                          'productId',a2.source_product_id::text,
                          'productKey',sp2.source_product_key,
                          'title',sp2.title,
                          'rawValue',a2.raw_value,
                          'sourceUnit',NULLIF(btrim(a2.source_unit),'')
                        ) AS payload,
                        a2.created_at,a2.id
                 FROM public.catalog_source_attribute_observations a2
                 JOIN public.catalog_source_products sp2 ON sp2.id=a2.source_product_id
                 WHERE a2.mapping_status='unmapped'
                   AND a2.attribute_id IS NULL
                   AND ($1::uuid IS NULL OR sp2.snapshot_id=$1::uuid)
                   AND sp2.source_id=g.source_id
                   AND a2.source_attribute_key=g.source_attribute_key
                   AND (
                     (g.scope_kind='taxonomy_node'
                       AND sp2.source_taxonomy_node_id::text IS NOT DISTINCT FROM g.scope_key)
                     OR
                     (g.scope_kind='source_category'
                       AND sp2.source_taxonomy_node_id IS NULL
                       AND COALESCE(
                         NULLIF(btrim(sp2.source_identity->>'categoryId'),''),
                         NULLIF(btrim(sp2.source_identity->>'category_id'),''),
                         NULLIF(btrim(sp2.normalized_payload->>'sourceCategoryId'),'')
                       ) IS NOT DISTINCT FROM g.scope_key)
                     OR
                     (g.scope_kind='unscoped'
                       AND sp2.source_taxonomy_node_id IS NULL
                       AND COALESCE(
                         NULLIF(btrim(sp2.source_identity->>'categoryId'),''),
                         NULLIF(btrim(sp2.source_identity->>'category_id'),''),
                         NULLIF(btrim(sp2.normalized_payload->>'sourceCategoryId'),'')
                       ) IS NULL)
                   )
                 ORDER BY a2.created_at,a2.id
                 LIMIT 4
               ) sample
             ),'[]'::jsonb) AS samples
      FROM top_groups g
      ORDER BY g.observation_count DESC,g.product_count DESC,g.source_name,g.source_attribute_key
    `, [snapshotId ?? null, limit]);

    if (cardResult.rows.length === 0) {
      return { csrfToken: principal.csrfToken, snapshotId, totalUnmapped: 0, unresolvedGroups: 0, cards: [], targets: [] };
    }

    const [targetResult, historyResult] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT pt.id::text AS product_type_id,
               pt.code AS product_type_code,
               COALESCE(NULLIF(ptt.name,''),pt.code) AS product_type_name,
               ad.id::text AS attribute_id,
               ad.code AS attribute_code,
               ad.data_type,
               COALESCE(pta.unit_override,ad.unit) AS effective_unit,
               ad.group_code,
               COALESCE(array_agg(DISTINCT NULLIF(btrim(at.label),'')) FILTER (WHERE at.label IS NOT NULL),ARRAY[]::text[]) AS labels
        FROM public.product_type_attributes pta
        JOIN public.product_types pt ON pt.id=pta.product_type_id AND pt.status='active'
        JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
        LEFT JOIN public.product_type_translations ptt ON ptt.product_type_id=pt.id AND upper(ptt.locale)='EL'
        LEFT JOIN public.attribute_translations at ON at.attribute_id=ad.id AND upper(at.locale) IN ('EL','EN')
        GROUP BY pt.id,pt.code,ptt.name,ad.id,ad.code,ad.data_type,pta.unit_override,ad.unit,ad.group_code,pta.sort_order
        ORDER BY pt.code,pta.sort_order,ad.code,ad.id
        LIMIT 5000
      `),
      tx.query<SqlRow>(`
        SELECT source_id::text AS source_id,source_attribute_key,
               product_type_id::text AS product_type_id,attribute_id::text AS attribute_id
        FROM public.catalog_source_attribute_mapping_rules
        WHERE status='approved'
        ORDER BY reviewed_at DESC
        LIMIT 5000
      `)
    ]);

    const rawCards = cardResult.rows.map(mapRawCard);
    const targets = targetResult.rows.map(mapTarget);
    const history = historyResult.rows.map(mapHistory);
    const cards = buildCards(rawCards, targets, history);
    return {
      csrfToken: principal.csrfToken,
      snapshotId,
      totalUnmapped: integer(cardResult.rows[0]?.total_unmapped),
      unresolvedGroups: integer(cardResult.rows[0]?.unresolved_groups),
      cards,
      targets: targets.map(({ labels: _labels, ...target }) => target)
    };
  }, { readOnly: true, statementTimeoutMs: 12_000 });
}

function buildCards(cards: readonly RawCard[], targets: readonly TargetInternal[], history: readonly HistoricalRule[]): AttributeTrainerCard[] {
  const historyIndex = new Set(history.map((item) => `${item.sourceId}|${item.sourceAttributeKey}|${item.productTypeId}|${item.attributeId}`));
  return cards.map((card) => {
    const allowed = new Set(card.allowedProductTypeIds);
    let blocker: string | undefined;
    if (card.scopeKind === "unscoped") blocker = "A stable supplier/provider category is required before this decision can become reusable knowledge.";
    else if (card.scopeKind === "taxonomy_node" && !card.approvedCategoryCode) blocker = "Approve the supplier taxonomy → KONTAMOU category mapping first.";
    else if (card.scopeKind === "taxonomy_node" && allowed.size === 0) blocker = "The approved category has no active Product Type contract yet.";

    const sourceKey = normalize(card.sourceAttributeKey);
    const suggestions = targets
      .filter((target) => card.scopeKind !== "taxonomy_node" || allowed.has(target.productTypeId))
      .map((target) => score(card, target, sourceKey, historyIndex))
      .filter((candidate) => candidate.score >= 0.34)
      .sort((a, b) => b.score - a.score || a.productTypeName.localeCompare(b.productTypeName) || a.attributeCode.localeCompare(b.attributeCode))
      .slice(0, 5);

    return {
      ...card,
      id: [card.sourceId, card.sourceAttributeKey, card.scopeKind, card.scopeKey ?? "none"].join(":"),
      suggestions,
      actionable: !blocker,
      blocker
    };
  });
}

function score(card: RawCard, target: TargetInternal, sourceKey: string, history: ReadonlySet<string>): AttributeTrainerSuggestion {
  const labels = [target.attributeCode, ...target.labels].map(normalize).filter(Boolean);
  let value = 0;
  const reasons: string[] = [];
  if (labels.includes(sourceKey)) {
    value += 0.68;
    reasons.push("Exact normalized label match");
  } else {
    const similarity = Math.max(0, ...labels.map((label) => similarityScore(sourceKey, label)));
    value += similarity * 0.50;
    if (similarity >= 0.5) reasons.push(`Label similarity ${Math.round(similarity * 100)}%`);
  }

  if (history.has(`${card.sourceId}|${card.sourceAttributeKey}|${target.productTypeId}|${target.attributeId}`)) {
    value += 0.20;
    reasons.push("Previously approved for this supplier key");
  }

  const canonicalUnit = normalizeUnit(target.unit);
  const sourceUnits = card.sourceUnits.map(normalizeUnit).filter(Boolean);
  if (canonicalUnit && sourceUnits.includes(canonicalUnit)) {
    value += 0.12;
    reasons.push(`Unit agrees (${target.unit})`);
  } else if (canonicalUnit && sourceUnits.length > 0) {
    value -= 0.08;
  }

  return { ...target, score: clamp(value), reasons: reasons.slice(0, 3) };
}

function mapRawCard(row: SqlRow): RawCard {
  const scopeKind = String(row.scope_kind) as RawCard["scopeKind"];
  const samplesValue = Array.isArray(row.samples) ? row.samples : [];
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
    samples: samplesValue.map((sample) => mapSample(sample)).filter((sample): sample is AttributeTrainerSample => Boolean(sample))
  };
}

function mapSample(value: unknown): AttributeTrainerSample | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const productId = optional(row.productId);
  if (!productId) return undefined;
  return {
    productId,
    productKey: String(row.productKey ?? ""),
    title: String(row.title ?? "Untitled product"),
    rawValue: row.rawValue,
    sourceUnit: optional(row.sourceUnit)
  };
}

function mapTarget(row: SqlRow): TargetInternal {
  return {
    productTypeId: required(row.product_type_id, "product type.id"),
    productTypeCode: required(row.product_type_code, "product type.code"),
    productTypeName: required(row.product_type_name, "product type.name"),
    attributeId: required(row.attribute_id, "attribute.id"),
    attributeCode: required(row.attribute_code, "attribute.code"),
    dataType: required(row.data_type, "attribute.data_type"),
    unit: optional(row.effective_unit),
    groupCode: optional(row.group_code),
    labels: stringArray(row.labels)
  };
}

function mapHistory(row: SqlRow): HistoricalRule {
  return {
    sourceId: required(row.source_id, "history.source_id"),
    sourceAttributeKey: required(row.source_attribute_key, "history.source_attribute_key"),
    productTypeId: required(row.product_type_id, "history.product_type_id"),
    attributeId: required(row.attribute_id, "history.attribute_id")
  };
}

function canonicalCode(label: string): string {
  const code = normalize(label).replace(/\s+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  if (!code) throw new Error("Canonical attribute name cannot be converted to a stable code");
  return code;
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = new Set(tokens(a));
  const bTokens = new Set(tokens(b));
  let intersection = 0;
  for (const token of aTokens) if (bTokens.has(token)) intersection += 1;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  const tokenScore = intersection / union;
  const prefix = commonPrefix(a, b) / Math.max(a.length, b.length);
  return Math.max(tokenScore, prefix * 0.75);
}

function commonPrefix(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  let index = 0;
  while (index < length && a[index] === b[index]) index += 1;
  return index;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .trim();
}

function tokens(value: string): string[] {
  return value.split(/\s+/).map((token) => token.trim()).filter((token) => token.length >= 2);
}

function normalizeUnit(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("en-US").replace(/\s+/g, "");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
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
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}
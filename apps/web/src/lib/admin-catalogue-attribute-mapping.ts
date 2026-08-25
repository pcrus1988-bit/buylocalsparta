import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CanonicalAttributeOption = Readonly<{
  id: string;
  code: string;
  dataType: string;
  unit?: string;
}>;

export type AttributeMappingCandidate = Readonly<{
  attributeId: string;
  attributeCode: string;
  dataType: string;
  unit?: string;
  confidence: number;
  method: "exact_code" | "historical" | "fuzzy";
  reasons: readonly string[];
}>;

export type AttributeMappingGroup = Readonly<{
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  sourceUnit?: string;
  occurrenceCount: number;
  examples: readonly unknown[];
  candidates: readonly AttributeMappingCandidate[];
  safeForBulk: boolean;
}>;

export type AttributeMappingWorkspace = Readonly<{
  csrfToken: string;
  snapshotId?: string;
  totalUnmapped: number;
  groups: readonly AttributeMappingGroup[];
  attributes: readonly CanonicalAttributeOption[];
  highConfidenceGroups: number;
}>;

type RawGroup = Readonly<{
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  sourceUnit?: string;
  occurrenceCount: number;
  examples: readonly unknown[];
}>;

type HistoricalMapping = Readonly<{
  sourceId: string;
  sourceKey: string;
  sourceUnit?: string;
  attributeId: string;
  count: number;
}>;

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });
}

export async function adminCatalogueAttributeMappingWorkspace(principal: SessionPrincipal, snapshotId?: string): Promise<AttributeMappingWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return { csrfToken: principal.csrfToken, snapshotId, totalUnmapped: 0, groups: [], attributes: [], highConfidenceGroups: 0 };
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const effectiveSnapshotId = snapshotId?.trim() || undefined;
    const [groups, attributes, historical, totalUnmapped] = await Promise.all([
      readGroups(tx, effectiveSnapshotId),
      readDefinitions(tx),
      readHistoricalMappings(tx),
      readUnmappedCount(tx, effectiveSnapshotId)
    ]);
    const scored = scoreGroups(groups, attributes, historical);
    return {
      csrfToken: principal.csrfToken,
      snapshotId: effectiveSnapshotId,
      totalUnmapped,
      groups: scored,
      attributes,
      highConfidenceGroups: scored.filter((group) => group.safeForBulk).length
    };
  }, { readOnly: true, statementTimeoutMs: 20_000 });
}

export async function confirmCatalogueAttributeMapping(principal: SessionPrincipal, input: Readonly<{
  sourceId: string;
  sourceKey: string;
  sourceUnit?: string;
  attributeId: string;
  method?: "manual" | "exact_code" | "historical" | "fuzzy";
  confidence?: number;
  reasons?: readonly string[];
}>): Promise<{ mapped: number }> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const sourceId = input.sourceId.trim(), sourceKey = input.sourceKey.trim(), attributeId = input.attributeId.trim();
  if (!sourceId || !sourceKey || !attributeId) throw new Error("Source attribute and canonical attribute are required");
  const confidence = clampConfidence(input.confidence ?? (input.method === "manual" || !input.method ? 1 : 0.95));
  return uow().withTransaction(platformScope(principal.userId), async (tx) => applyMapping(tx, principal, {
    sourceId,
    sourceKey,
    sourceUnit: input.sourceUnit?.trim() || undefined,
    attributeId,
    method: input.method ?? "manual",
    confidence,
    reasons: input.reasons ?? ["admin_confirmed"]
  }), { isolation: "serializable", statementTimeoutMs: 20_000 });
}

export async function bulkConfirmHighConfidenceAttributeMappings(principal: SessionPrincipal, snapshotId: string): Promise<{ rules: number; mapped: number }> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const selectedSnapshot = snapshotId.trim();
  if (!selectedSnapshot) throw new Error("Snapshot is required");
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const [groups, attributes, historical] = await Promise.all([readGroups(tx, selectedSnapshot, 600), readDefinitions(tx), readHistoricalMappings(tx)]);
    const safe = scoreGroups(groups, attributes, historical).filter((group) => group.safeForBulk && group.candidates[0]).slice(0, 150);
    let mapped = 0;
    for (const group of safe) {
      const candidate = group.candidates[0]!;
      const result = await applyMapping(tx, principal, {
        sourceId: group.sourceId,
        sourceKey: group.sourceKey,
        sourceUnit: group.sourceUnit,
        attributeId: candidate.attributeId,
        method: "bulk_high_confidence",
        confidence: candidate.confidence,
        reasons: [...candidate.reasons, "bulk_high_confidence_admin_confirmation"]
      });
      mapped += result.mapped;
    }
    return { rules: safe.length, mapped };
  }, { isolation: "serializable", statementTimeoutMs: 30_000 });
}

async function readGroups(tx: SqlExecutor, snapshotId?: string, limit = 160): Promise<readonly RawGroup[]> {
  const result = await tx.query<SqlRow>(`
    WITH grouped AS (
      SELECT sp.source_id,
             cs.name AS source_name,
             a.source_attribute_key,
             NULLIF(btrim(a.source_unit),'') AS source_unit,
             count(*)::integer AS occurrence_count
      FROM public.catalog_source_attribute_observations a
      JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
      JOIN public.catalog_sources cs ON cs.id=sp.source_id
      WHERE a.mapping_status IN ('unmapped','review_required')
        AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
      GROUP BY sp.source_id,cs.name,a.source_attribute_key,NULLIF(btrim(a.source_unit),'')
    )
    SELECT g.source_id::text AS source_id,g.source_name,g.source_attribute_key,g.source_unit,g.occurrence_count,
           COALESCE((
             SELECT jsonb_agg(sample.raw_value)
             FROM (
               SELECT a2.raw_value
               FROM public.catalog_source_attribute_observations a2
               JOIN public.catalog_source_products sp2 ON sp2.id=a2.source_product_id
               WHERE sp2.source_id=g.source_id
                 AND ($1::uuid IS NULL OR sp2.snapshot_id=$1::uuid)
                 AND a2.mapping_status IN ('unmapped','review_required')
                 AND a2.source_attribute_key=g.source_attribute_key
                 AND NULLIF(btrim(a2.source_unit),'') IS NOT DISTINCT FROM g.source_unit
               ORDER BY a2.created_at,a2.id
               LIMIT 5
             ) sample
           ),'[]'::jsonb) AS examples
    FROM grouped g
    ORDER BY g.occurrence_count DESC,g.source_name,g.source_attribute_key
    LIMIT $2
  `, [snapshotId ?? null, limit]);
  return result.rows.map((row) => ({
    sourceId: required(row.source_id),
    sourceName: required(row.source_name),
    sourceKey: required(row.source_attribute_key),
    sourceUnit: optional(row.source_unit),
    occurrenceCount: integer(row.occurrence_count),
    examples: array(row.examples)
  }));
}

async function readDefinitions(tx: SqlExecutor): Promise<readonly CanonicalAttributeOption[]> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS id,code,data_type,unit FROM public.attribute_definitions ORDER BY code,id`);
  return result.rows.map((row) => ({ id: required(row.id), code: required(row.code), dataType: required(row.data_type), unit: optional(row.unit) }));
}

async function readHistoricalMappings(tx: SqlExecutor): Promise<readonly HistoricalMapping[]> {
  const result = await tx.query<SqlRow>(`
    SELECT sp.source_id::text AS source_id,a.source_attribute_key,NULLIF(btrim(a.source_unit),'') AS source_unit,
           a.attribute_id::text AS attribute_id,count(*)::integer AS mapped_count
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    WHERE a.attribute_id IS NOT NULL AND a.mapping_status='mapped'
    GROUP BY sp.source_id,a.source_attribute_key,NULLIF(btrim(a.source_unit),''),a.attribute_id
    ORDER BY mapped_count DESC
    LIMIT 4000
  `);
  return result.rows.map((row) => ({ sourceId: required(row.source_id), sourceKey: required(row.source_attribute_key), sourceUnit: optional(row.source_unit), attributeId: required(row.attribute_id), count: integer(row.mapped_count) }));
}

async function readUnmappedCount(tx: SqlExecutor, snapshotId?: string): Promise<number> {
  const result = await tx.query<SqlRow>(`
    SELECT count(*)::integer AS count
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    WHERE a.mapping_status IN ('unmapped','review_required')
      AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
  `, [snapshotId ?? null]);
  return integer(result.rows[0]?.count ?? 0);
}

function scoreGroups(groups: readonly RawGroup[], definitions: readonly CanonicalAttributeOption[], historical: readonly HistoricalMapping[]): AttributeMappingGroup[] {
  const historyByGroup = new Map<string, Map<string, number>>();
  const globalHistory = new Map<string, Map<string, number>>();
  for (const item of historical) {
    const normalized = normalizeKey(item.sourceKey);
    const exactKey = `${item.sourceId}|${normalized}|${normalizeUnit(item.sourceUnit)}`;
    const local = historyByGroup.get(exactKey) ?? new Map<string, number>();
    local.set(item.attributeId, (local.get(item.attributeId) ?? 0) + item.count);
    historyByGroup.set(exactKey, local);
    const global = globalHistory.get(normalized) ?? new Map<string, number>();
    global.set(item.attributeId, (global.get(item.attributeId) ?? 0) + item.count);
    globalHistory.set(normalized, global);
  }
  return groups.map((group) => {
    const normalized = normalizeKey(group.sourceKey);
    const local = historyByGroup.get(`${group.sourceId}|${normalized}|${normalizeUnit(group.sourceUnit)}`);
    const global = globalHistory.get(normalized);
    const candidates = definitions.map((definition) => scoreCandidate(group, definition, normalized, local, global)).sort((a, b) => b.confidence - a.confidence || a.attributeCode.localeCompare(b.attributeCode)).slice(0, 3);
    const top = candidates[0], second = candidates[1];
    const margin = (top?.confidence ?? 0) - (second?.confidence ?? 0);
    const safeForBulk = Boolean(top && (
      ((top.method === "exact_code" || top.method === "historical") && top.confidence >= 0.92 && margin >= 0.05)
      || (top.method === "fuzzy" && top.confidence >= 0.97 && margin >= 0.15)
    ));
    return { ...group, candidates, safeForBulk };
  });
}

function scoreCandidate(group: RawGroup, definition: CanonicalAttributeOption, normalizedSource: string, local?: Map<string, number>, global?: Map<string, number>): AttributeMappingCandidate {
  const normalizedCode = normalizeKey(definition.code);
  const reasons: string[] = [];
  let confidence = 0;
  let method: AttributeMappingCandidate["method"] = "fuzzy";

  if (normalizedSource === normalizedCode) {
    confidence = 0.99;
    method = "exact_code";
    reasons.push("normalized source key exactly matches canonical code");
  }

  const localTotal = local ? [...local.values()].reduce((sum, value) => sum + value, 0) : 0;
  const localCount = local?.get(definition.id) ?? 0;
  if (localCount > 0 && localTotal > 0) {
    const share = localCount / localTotal;
    const historical = share >= 0.85 ? 0.96 + Math.min(0.025, Math.log10(localCount + 1) * 0.01) : 0.75 + share * 0.18;
    if (historical > confidence) { confidence = historical; method = "historical"; }
    reasons.push(`${localCount} prior mapping${localCount === 1 ? "" : "s"} for this source key (${Math.round(share * 100)}% agreement)`);
  } else {
    const globalTotal = global ? [...global.values()].reduce((sum, value) => sum + value, 0) : 0;
    const globalCount = global?.get(definition.id) ?? 0;
    if (globalCount > 0 && globalTotal > 0) {
      const share = globalCount / globalTotal;
      const historical = share >= 0.9 ? 0.91 + Math.min(0.025, Math.log10(globalCount + 1) * 0.01) : 0.68 + share * 0.18;
      if (historical > confidence) { confidence = historical; method = "historical"; }
      reasons.push(`${globalCount} prior cross-source mapping${globalCount === 1 ? "" : "s"} (${Math.round(share * 100)}% agreement)`);
    }
  }

  const similarity = blendedSimilarity(normalizedSource, normalizedCode);
  const fuzzy = 0.42 + similarity * 0.48;
  if (fuzzy > confidence) { confidence = fuzzy; method = "fuzzy"; }
  if (similarity >= 0.6) reasons.push(`key similarity ${Math.round(similarity * 100)}%`);

  const sourceUnit = normalizeUnit(group.sourceUnit), targetUnit = normalizeUnit(definition.unit);
  if (sourceUnit && targetUnit && sourceUnit === targetUnit) { confidence += 0.055; reasons.push(`unit agrees (${definition.unit})`); }
  else if (sourceUnit && targetUnit && sourceUnit !== targetUnit) { confidence -= 0.14; reasons.push(`unit mismatch (${group.sourceUnit} vs ${definition.unit})`); }

  const inferredType = inferValueType(group.examples);
  if (inferredType && dataTypeCompatible(inferredType, definition.dataType)) { confidence += 0.025; reasons.push(`sample values fit ${definition.dataType}`); }
  else if (inferredType && !dataTypeCompatible(inferredType, definition.dataType)) { confidence -= 0.05; reasons.push(`sample values may not fit ${definition.dataType}`); }

  return {
    attributeId: definition.id,
    attributeCode: definition.code,
    dataType: definition.dataType,
    unit: definition.unit,
    confidence: clampConfidence(confidence),
    method,
    reasons: reasons.slice(0, 4)
  };
}

async function applyMapping(tx: SqlExecutor, principal: SessionPrincipal, input: Readonly<{
  sourceId: string; sourceKey: string; sourceUnit?: string; attributeId: string;
  method: "manual" | "exact_code" | "historical" | "fuzzy" | "bulk_high_confidence";
  confidence: number; reasons: readonly string[];
}>): Promise<{ mapped: number }> {
  const valid = await tx.query<SqlRow>(`
    SELECT EXISTS(SELECT 1 FROM public.catalog_sources WHERE id=$1::uuid) AS source_exists,
           EXISTS(SELECT 1 FROM public.attribute_definitions WHERE id=$2::uuid) AS attribute_exists
  `, [input.sourceId, input.attributeId]);
  if (valid.rows[0]?.source_exists !== true || valid.rows[0]?.attribute_exists !== true) throw new Error("Source or canonical attribute no longer exists");

  await tx.query(`
    UPDATE public.catalog_attribute_mapping_rules
    SET status='superseded',updated_at=now()
    WHERE source_id=$1::uuid
      AND status='approved'
      AND normalized_source_key=bls_private.catalog_attribute_normalize_key($2)
      AND COALESCE(lower(btrim(source_unit)),'')=COALESCE(lower(btrim($3::text)),'')
  `, [input.sourceId, input.sourceKey, input.sourceUnit ?? null]);

  const rule = await tx.query<SqlRow>(`
    INSERT INTO public.catalog_attribute_mapping_rules(
      source_id,source_attribute_key,normalized_source_key,source_unit,attribute_id,status,mapping_method,
      confidence,reasons,sample_values,created_by,reviewed_by,reviewed_at,metadata,created_at,updated_at
    ) VALUES(
      $1::uuid,$2,bls_private.catalog_attribute_normalize_key($2),$3,$4::uuid,'approved',$5,$6,$7::jsonb,'[]'::jsonb,
      (SELECT id FROM public.users WHERE public_id=$8 OR id::text=$8 LIMIT 1),
      (SELECT id FROM public.users WHERE public_id=$8 OR id::text=$8 LIMIT 1),now(),
      jsonb_build_object('confirmation','admin','engine','catalog-attribute-mapper-v1'),now(),now()
    ) RETURNING public_id
  `, [input.sourceId, input.sourceKey, input.sourceUnit ?? null, input.attributeId, input.method, input.confidence, JSON.stringify(input.reasons), principal.userId]);
  const ruleId = required(rule.rows[0]?.public_id);

  const changed = await tx.query<SqlRow>(`
    UPDATE public.catalog_source_attribute_observations a
    SET attribute_id=$4::uuid,
        mapping_status='mapped',
        confidence=$5,
        metadata=COALESCE(a.metadata,'{}'::jsonb) || jsonb_build_object(
          'attributeMappingRule',$6,
          'attributeMappingMethod',$7,
          'attributeMappingReviewedAt',now()
        )
    FROM public.catalog_source_products sp
    WHERE sp.id=a.source_product_id
      AND sp.source_id=$1::uuid
      AND bls_private.catalog_attribute_normalize_key(a.source_attribute_key)=bls_private.catalog_attribute_normalize_key($2)
      AND COALESCE(lower(btrim(a.source_unit)),'')=COALESCE(lower(btrim($3::text)),'')
      AND a.mapping_status IN ('unmapped','review_required')
    RETURNING a.id::text AS id
  `, [input.sourceId, input.sourceKey, input.sourceUnit ?? null, input.attributeId, input.confidence, ruleId, input.method]);
  return { mapped: changed.rowCount };
}

function normalizeKey(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function normalizeUnit(value?: string): string { return value?.trim().toLocaleLowerCase("en") ?? ""; }
function tokens(value: string): Set<string> { return new Set(value.split(/\s+/).filter(Boolean)); }
function blendedSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = tokens(a), bb = tokens(b), intersection = [...aa].filter((token) => bb.has(token)).length, union = new Set([...aa, ...bb]).size;
  const jaccard = union ? intersection / union : 0;
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  return Math.max(0, Math.min(1, jaccard * 0.6 + edit * 0.4));
}
function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j], left = previous[j - 1], cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(above + 1, left + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length];
}
function inferValueType(values: readonly unknown[]): "number" | "boolean" | "text" | undefined {
  const scalars = values.map((value) => unwrap(value)).filter((value) => value !== undefined);
  if (!scalars.length) return undefined;
  if (scalars.every((value) => typeof value === "number" || (typeof value === "string" && /^-?\d+(?:[.,]\d+)?$/.test(value.trim())))) return "number";
  if (scalars.every((value) => typeof value === "boolean" || (typeof value === "string" && /^(?:true|false|yes|no|ναι|όχι)$/i.test(value.trim())))) return "boolean";
  return "text";
}
function unwrap(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return record.value ?? record.text ?? record.number ?? value;
  }
  return value;
}
function dataTypeCompatible(inferred: "number" | "boolean" | "text", dataType: string): boolean {
  if (inferred === "number") return dataType === "number" || dataType === "dimension";
  if (inferred === "boolean") return dataType === "boolean" || dataType === "enum";
  return dataType === "text" || dataType === "enum" || dataType === "multienum";
}
function clampConfidence(value: number): number { return Math.max(0, Math.min(1, Math.round(value * 100000) / 100000)); }
function required(value: unknown): string { if (typeof value !== "string" || !value.length) throw new Error("Expected non-empty database string"); return value; }
function optional(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function integer(value: unknown): number { const parsed = Number(value ?? 0); if (!Number.isSafeInteger(parsed)) throw new Error("Expected database integer"); return parsed; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

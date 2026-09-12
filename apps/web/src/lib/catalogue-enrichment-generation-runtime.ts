import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  buildBazaarPresentationOverlay,
  buildDeterministicGreekPresentation,
  catalogueAiEnrichmentEnabled,
  type BazaarPresentationOverlay,
  type FactProvenance,
  type VerifiedProductFacts
} from "./catalogue-enrichment";
import {
  OpenAiCatalogueEnricher,
  openAiCatalogueEnrichmentConfigFromEnv,
  type CatalogueGenerationResult
} from "./catalogue-enrichment-openai";
import {
  sanitizeSupplierEvidenceText,
  validateLuxuryCatalogueDraft
} from "./catalogue-enrichment-policy";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 10;
const DEFAULT_MAX_ATTEMPTS = 3;

export type CatalogueEnrichmentGenerationSliceResult = Readonly<{
  enabled: boolean;
  scope: "disabled" | "pilot" | "all";
  claimed: number;
  enriched: number;
  needsReview: number;
  failed: number;
  message?: string;
}>;

type ClaimedEnrichment = Readonly<{
  id: string;
  externalProductId: string;
  sourceProductId: string;
  sourceHash: string;
  facts: VerifiedProductFacts;
  provenance: FactProvenance;
  attemptCount: number;
}>;

type GenerationScope = Readonly<{
  enabled: boolean;
  allowAll: boolean;
  productIds: readonly string[];
  batchSize: number;
  maxAttempts: number;
}>;

/**
 * Generate customer-facing Greek luxury merchandising copy for already prepared
 * catalogue enrichment rows.
 *
 * Fail-closed boundaries:
 * - disabled unless BLS_CATALOGUE_AI_ENRICHMENT_ENABLED=true;
 * - even then, no rows run unless an explicit product allow-list exists or the
 *   separate BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL=true switch is set;
 * - generated copy never becomes storefront content here; it only moves the
 *   enrichment row to `enriched` after deterministic validation;
 * - validation failures are retained as QA candidates under `needs_review`;
 * - source-hash changes invalidate stale generation results.
 */
export async function runCatalogueEnrichmentGenerationSlice(
  env: NodeJS.ProcessEnv = process.env
): Promise<CatalogueEnrichmentGenerationSliceResult> {
  const scope = generationScope(env);
  if (!scope.enabled) return emptyResult(false,"disabled","ai_enrichment_disabled");
  if (!scope.allowAll && scope.productIds.length === 0) {
    return emptyResult(true,"pilot","pilot_scope_empty");
  }

  const enricher = new OpenAiCatalogueEnricher(openAiCatalogueEnrichmentConfigFromEnv(env));
  const mutable = {
    enabled: true,
    scope: scope.allowAll ? "all" as const : "pilot" as const,
    claimed: 0,
    enriched: 0,
    needsReview: 0,
    failed: 0
  };

  for (let index=0; index<scope.batchSize; index += 1) {
    const claimed = await claimNext(scope);
    if (!claimed) break;
    mutable.claimed += 1;

    try {
      const source = await sourceEvidence(claimed.sourceProductId);
      if (!source) {
        if (await markGenerationFailure(claimed,"source_evidence_missing",scope.maxAttempts,true)) mutable.failed += 1;
        continue;
      }

      const fallback = buildDeterministicGreekPresentation(claimed.facts);
      const bazaar = buildBazaarPresentationOverlay(source.payload);
      const sourceTitle = sanitizeSupplierEvidenceText(source.payload.name,800);
      const sourceDescription = sanitizeSupplierEvidenceText(source.payload.description,6000);
      const generated = await enricher.generate({
        externalProductId: claimed.externalProductId,
        sourceTitle,
        sourceDescription,
        facts: claimed.facts,
        provenance: claimed.provenance,
        fallback,
        bazaar
      });
      const validationErrors = validateLuxuryCatalogueDraft({
        facts: claimed.facts,
        draft: generated.draft,
        sourceTitle,
        sourceDescription,
        bazaar
      });

      if (validationErrors.length) {
        const persisted = await persistRejectedCandidate(claimed,generated,bazaar,validationErrors);
        if (persisted) mutable.needsReview += 1;
        else await releaseStaleClaim(claimed);
        continue;
      }

      const accepted = await persistAcceptedCandidate(claimed,generated,bazaar);
      if (accepted) mutable.enriched += 1;
      else {
        // Supplier evidence changed while the model was working. Discard the stale
        // candidate and let preparation/new generation handle the current hash.
        await releaseStaleClaim(claimed);
      }
    } catch (error) {
      const terminal = claimed.attemptCount >= scope.maxAttempts;
      const persisted = await markGenerationFailure(claimed,safeError(error),scope.maxAttempts,terminal);
      if (terminal && persisted) mutable.failed += 1;
    }
  }

  return mutable;
}

export function catalogueEnrichmentGenerationScope(env: NodeJS.ProcessEnv = process.env): Readonly<{
  enabled: boolean;
  allowAll: boolean;
  productIds: readonly string[];
  batchSize: number;
  maxAttempts: number;
}> {
  return generationScope(env);
}

async function claimNext(scope: GenerationScope): Promise<ClaimedEnrichment | null> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const result = await pool.query<SqlRow>(`
    WITH candidate AS (
      SELECT ce.id
      FROM public.catalogue_enrichments ce
      WHERE ce.status='pending'
        AND ce.source_product_id IS NOT NULL
        AND ce.generation_attempt_count < $1
        AND (ce.processing_lease_until IS NULL OR ce.processing_lease_until < now())
        AND ($2::boolean OR ce.external_product_id = ANY($3::text[]))
      ORDER BY ce.updated_at,ce.id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE public.catalogue_enrichments ce
    SET processing_lease_until=now()+interval '3 minutes',
        generation_attempt_count=ce.generation_attempt_count+1,
        last_attempt_at=now(),
        last_error=NULL,
        updated_at=now()
    FROM candidate
    WHERE ce.id=candidate.id
    RETURNING
      ce.id,ce.external_product_id,ce.source_product_id,ce.source_hash,
      ce.verified_facts,ce.fact_provenance,ce.generation_attempt_count
  `,[scope.maxAttempts,scope.allowAll,[...scope.productIds]]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: requiredText(row.id,"enrichment id"),
    externalProductId: requiredText(row.external_product_id,"external product id"),
    sourceProductId: requiredText(row.source_product_id,"source product id"),
    sourceHash: requiredText(row.source_hash,"source hash"),
    facts: parseFacts(row.verified_facts),
    provenance: parseProvenance(row.fact_provenance),
    attemptCount: requiredInteger(row.generation_attempt_count,"generation attempt count")
  };
}

async function sourceEvidence(sourceProductId: string): Promise<{ payload: Readonly<Record<string,unknown>> } | null> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT normalized_payload
    FROM public.catalog_source_products
    WHERE id=$1::uuid
    LIMIT 1
  `,[sourceProductId]);
  const row = result.rows[0];
  return row ? { payload: record(row.normalized_payload) } : null;
}

async function persistAcceptedCandidate(
  claimed: ClaimedEnrichment,
  generated: CatalogueGenerationResult,
  bazaar: BazaarPresentationOverlay
): Promise<boolean> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    UPDATE public.catalogue_enrichments
    SET status='enriched',
        display_title_el=$3,
        display_short_description_el=$4,
        display_description_el=$5,
        display_title_en=NULL,
        display_short_description_en=NULL,
        display_description_en=NULL,
        generation_provider=$6,
        generation_model=$7,
        generation_request_id=$8,
        generation_metadata=$9::jsonb,
        generation_candidate=$10::jsonb,
        validation_errors='[]'::jsonb,
        prompt_version=$11,
        enrichment_version=enrichment_version+1,
        generated_at=now(),
        validated_at=now(),
        processing_lease_until=NULL,
        last_error=NULL,
        updated_at=now()
    WHERE id=$1::uuid
      AND source_hash=$2
      AND status='pending'
      AND generation_attempt_count=$12
    RETURNING id
  `,[
    claimed.id,
    claimed.sourceHash,
    generated.draft.titleEl,
    generated.draft.shortDescriptionEl,
    generated.draft.descriptionEl,
    generated.telemetry.provider,
    generated.telemetry.model,
    generated.telemetry.requestId,
    JSON.stringify({ usage: generated.telemetry.usage,bazaar }),
    JSON.stringify(generated.draft),
    generated.telemetry.promptVersion,
    claimed.attemptCount
  ]);
  return (result.rowCount ?? result.rows.length) > 0;
}

async function persistRejectedCandidate(
  claimed: ClaimedEnrichment,
  generated: CatalogueGenerationResult,
  bazaar: BazaarPresentationOverlay,
  validationErrors: readonly string[]
): Promise<boolean> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    UPDATE public.catalogue_enrichments
    SET status='needs_review',
        generation_provider=$3,
        generation_model=$4,
        generation_request_id=$5,
        generation_metadata=$6::jsonb,
        generation_candidate=$7::jsonb,
        validation_errors=$8::jsonb,
        prompt_version=$9,
        generated_at=now(),
        validated_at=now(),
        processing_lease_until=NULL,
        last_error='validation_failed',
        updated_at=now()
    WHERE id=$1::uuid
      AND source_hash=$2
      AND status='pending'
      AND generation_attempt_count=$10
    RETURNING id
  `,[
    claimed.id,
    claimed.sourceHash,
    generated.telemetry.provider,
    generated.telemetry.model,
    generated.telemetry.requestId,
    JSON.stringify({ usage: generated.telemetry.usage,bazaar }),
    JSON.stringify(generated.draft),
    JSON.stringify(validationErrors),
    generated.telemetry.promptVersion,
    claimed.attemptCount
  ]);
  return (result.rowCount ?? result.rows.length) > 0;
}

async function markGenerationFailure(
  claimed: ClaimedEnrichment,
  error: string,
  maxAttempts: number,
  forceTerminal: boolean
): Promise<boolean> {
  const terminal = forceTerminal || claimed.attemptCount >= maxAttempts;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    UPDATE public.catalogue_enrichments
    SET status=CASE WHEN $4::boolean THEN 'failed' ELSE 'pending' END,
        processing_lease_until=CASE WHEN $4::boolean THEN NULL ELSE now()+interval '10 minutes' END,
        last_error=$3,
        updated_at=now()
    WHERE id=$1::uuid
      AND source_hash=$2
      AND generation_attempt_count=$5
    RETURNING id
  `,[claimed.id,claimed.sourceHash,error.slice(0,500),terminal,claimed.attemptCount]);
  return (result.rowCount ?? result.rows.length) > 0;
}

async function releaseStaleClaim(claimed: ClaimedEnrichment): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalogue_enrichments
    SET processing_lease_until=NULL,
        updated_at=now()
    WHERE id=$1::uuid
      AND generation_attempt_count=$2
      AND status='pending'
  `,[claimed.id,claimed.attemptCount]);
}

function generationScope(env: NodeJS.ProcessEnv): GenerationScope {
  const enabled = catalogueAiEnrichmentEnabled(env);
  const allowAll = enabled && env.BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL === "true";
  const productIds = [...new Set((env.BLS_CATALOGUE_AI_ENRICHMENT_PRODUCT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 160))];
  return {
    enabled,
    allowAll,
    productIds,
    batchSize: boundedPositiveInteger(env.BLS_CATALOGUE_AI_ENRICHMENT_BATCH_SIZE,DEFAULT_BATCH_SIZE,MAX_BATCH_SIZE),
    maxAttempts: boundedPositiveInteger(env.BLS_CATALOGUE_AI_MAX_ATTEMPTS,DEFAULT_MAX_ATTEMPTS,10)
  };
}

function parseFacts(value: unknown): VerifiedProductFacts {
  const row = record(value);
  const dimensionsRaw = record(row.dimensions);
  const dimensions: Record<string,string | number> = {};
  for (const [key,item] of Object.entries(dimensionsRaw)) {
    if ((typeof item === "string" && item.trim()) || (typeof item === "number" && Number.isFinite(item))) dimensions[key] = item as string | number;
  }
  return {
    brand: nullableText(row.brand),
    model: nullableText(row.model),
    productType: nullableText(row.productType),
    color: nullableText(row.color),
    materials: stringArray(row.materials),
    dimensions,
    season: nullableText(row.season),
    gender: nullableText(row.gender),
    condition: nullableText(row.condition),
    features: stringArray(row.features),
    claims: stringArray(row.claims)
  };
}

function parseProvenance(value: unknown): FactProvenance {
  const row = record(value);
  return Object.fromEntries(Object.entries(row).flatMap(([key,item]) => {
    const values = stringArray(item);
    return values.length ? [[key,values] as const] : [];
  }));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];
}

function requiredText(value: unknown, label: string): string {
  const valueText = text(value);
  if (!valueText) throw new Error(`${label} is required`);
  return valueText;
}

function nullableText(value: unknown): string | null {
  return text(value);
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function requiredInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a nonnegative integer`);
  return parsed;
}

function boundedPositiveInteger(raw: string | undefined, fallback: number, maximum: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value,maximum) : fallback;
}

function record(value: unknown): Readonly<Record<string,unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string,unknown>> : {};
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).replace(/\s+/g," ").slice(0,500);
}

function emptyResult(
  enabled: boolean,
  scope: "disabled" | "pilot" | "all",
  message: string
): CatalogueEnrichmentGenerationSliceResult {
  return { enabled,scope,claimed: 0,enriched: 0,needsReview: 0,failed: 0,message };
}

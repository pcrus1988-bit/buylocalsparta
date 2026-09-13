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
  buildCatalogueEvidenceCoverage,
  sanitizeSupplierEvidenceText,
  validateLuxuryCatalogueDraft,
  type EvidenceCoverageReport
} from "./catalogue-enrichment-policy";
import {
  catalogueResearchEligibility,
  catalogueResearchSourceHash,
  extractCatalogueProductIdentifiers,
  type CatalogueProductIdentifiers
} from "./catalogue-enrichment-identifiers";
import {
  OpenAiCatalogueResearcher,
  openAiCatalogueResearchConfigFromEnv,
  type CataloguePublicResearchResult,
  type CatalogueResearchFact,
  type CatalogueResearchIdentity,
  type CatalogueResearchSource
} from "./catalogue-enrichment-research-openai";

const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 10;
const DEFAULT_MAX_ATTEMPTS = 3;
const QUALITY_VERSION = "catalogue-quality-v4";

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
  familyId: string | null;
  facts: VerifiedProductFacts;
  provenance: FactProvenance;
  attemptCount: number;
  researchStatus: string;
  researchSourceHash: string | null;
  researchEvidence: Readonly<Record<string,unknown>>;
  researchIdentity: Readonly<Record<string,unknown>>;
  researchSources: readonly unknown[];
}>;

type GenerationScope = Readonly<{
  enabled: boolean;
  allowAll: boolean;
  productIds: readonly string[];
  batchSize: number;
  maxAttempts: number;
}>;

type ResearchContext = Readonly<{
  status: "not_requested" | "pending" | "researched" | "insufficient" | "conflict" | "failed";
  identity: CatalogueResearchIdentity | Readonly<Record<string,unknown>>;
  facts: readonly CatalogueResearchFact[];
  sources: readonly CatalogueResearchSource[] | readonly unknown[];
  version: string | null;
  sourceHash: string;
}>;

export async function runCatalogueEnrichmentGenerationSlice(
  env: NodeJS.ProcessEnv = process.env
): Promise<CatalogueEnrichmentGenerationSliceResult> {
  const scope = generationScope(env);
  if (!scope.enabled) return emptyResult(false,"disabled","ai_enrichment_disabled");
  if (!scope.allowAll && scope.productIds.length === 0) return emptyResult(true,"pilot","pilot_scope_empty");

  const enricher = new OpenAiCatalogueEnricher(openAiCatalogueEnrichmentConfigFromEnv(env));
  const researchEnabled = env.BLS_CATALOGUE_WEB_RESEARCH_ENABLED === "true";
  const researcher = researchEnabled ? new OpenAiCatalogueResearcher(openAiCatalogueResearchConfigFromEnv(env)) : null;
  const mutable = { enabled: true,scope: scope.allowAll ? "all" as const : "pilot" as const,claimed: 0,enriched: 0,needsReview: 0,failed: 0 };

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
      const identifiers = extractCatalogueProductIdentifiers(source.payload);
      const research = await resolveResearch({ claimed,identifiers,sourceTitle,sourceDescription,researcher });

      const generated = await enricher.generate({
        externalProductId: claimed.externalProductId,
        sourceTitle,sourceDescription,
        facts: claimed.facts,
        provenance: claimed.provenance,
        fallback,bazaar,
        researchFacts: research.facts
      });
      const validationInput = {
        facts: claimed.facts,
        draft: generated.draft,
        sourceTitle,sourceDescription,bazaar,
        researchFacts: research.facts
      } as const;
      const coverage = buildCatalogueEvidenceCoverage(validationInput);
      const validationErrors = [...validateLuxuryCatalogueDraft(validationInput)];
      if (research.status === "conflict") validationErrors.push("public_research_identity_conflict");
      const uniqueErrors = [...new Set(validationErrors)];

      if (uniqueErrors.length) {
        const persisted = await persistRejectedCandidate(claimed,generated,bazaar,uniqueErrors,identifiers,research,coverage);
        if (persisted) mutable.needsReview += 1;
        else await releaseStaleClaim(claimed);
        continue;
      }

      const accepted = await persistAcceptedCandidate(claimed,generated,bazaar,identifiers,research,coverage);
      if (accepted) mutable.enriched += 1;
      else await releaseStaleClaim(claimed);
    } catch (error) {
      const terminal = claimed.attemptCount >= scope.maxAttempts;
      const persisted = await markGenerationFailure(claimed,safeError(error),scope.maxAttempts,terminal);
      if (terminal && persisted) mutable.failed += 1;
    }
  }
  return mutable;
}

export function catalogueEnrichmentGenerationScope(env: NodeJS.ProcessEnv = process.env): Readonly<{
  enabled: boolean; allowAll: boolean; productIds: readonly string[]; batchSize: number; maxAttempts: number;
}> {
  return generationScope(env);
}

async function resolveResearch(input: Readonly<{
  claimed: ClaimedEnrichment;
  identifiers: CatalogueProductIdentifiers;
  sourceTitle: string | null;
  sourceDescription: string | null;
  researcher: OpenAiCatalogueResearcher | null;
}>): Promise<ResearchContext> {
  const researchHash = catalogueResearchSourceHash(input.claimed.sourceHash,input.identifiers);
  if (input.claimed.researchSourceHash === researchHash && input.claimed.researchStatus === "researched") {
    return {
      status: "researched",
      identity: input.claimed.researchIdentity,
      facts: parseResearchFacts(input.claimed.researchEvidence),
      sources: input.claimed.researchSources,
      version: text(input.claimed.researchEvidence.version),
      sourceHash: researchHash
    };
  }

  const eligibility = catalogueResearchEligibility({
    identifiers: input.identifiers,
    facts: input.claimed.facts,
    sourceTitle: input.sourceTitle
  });

  if (!input.claimed.familyId) {
    const context: ResearchContext = { status:"not_requested",identity:{ basis:"supplier_only_row" },facts:[],sources:[],version:null,sourceHash:researchHash };
    await persistResearch(input.claimed,input.identifiers,context);
    return context;
  }
  if (!eligibility.eligible) {
    const context: ResearchContext = { status:"insufficient",identity:{ match:"none",basis:eligibility.reason,matchedIdentifiers:[] },facts:[],sources:[],version:null,sourceHash:researchHash };
    await persistResearch(input.claimed,input.identifiers,context);
    return context;
  }
  if (!input.researcher) {
    const context: ResearchContext = { status:"pending",identity:{ match:"none",basis:"web_research_disabled",matchedIdentifiers:[] },facts:[],sources:[],version:null,sourceHash:researchHash };
    await persistResearch(input.claimed,input.identifiers,context);
    return context;
  }

  try {
    const result = await input.researcher.research({
      eligibility,
      identifiers: input.identifiers,
      facts: input.claimed.facts,
      sourceTitle: input.sourceTitle,
      sourceDescription: input.sourceDescription
    });
    const context = researchResultContext(result,researchHash);
    await persistResearch(input.claimed,input.identifiers,context);
    return context;
  } catch (error) {
    const context: ResearchContext = { status:"failed",identity:{ match:"none",basis:safeError(error),matchedIdentifiers:[] },facts:[],sources:[],version:null,sourceHash:researchHash };
    await persistResearch(input.claimed,input.identifiers,context);
    return context;
  }
}

function researchResultContext(result: CataloguePublicResearchResult,sourceHash: string): ResearchContext {
  return {
    status: result.status,
    identity: result.identity,
    facts: result.facts,
    sources: result.sources,
    version: result.telemetry.researchVersion,
    sourceHash
  };
}

async function persistResearch(claimed: ClaimedEnrichment,identifiers: CatalogueProductIdentifiers,research: ResearchContext): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalogue_enrichments
    SET identifiers=$3::jsonb,
        research_status=$4,
        research_identity=$5::jsonb,
        research_evidence=$6::jsonb,
        research_sources=$7::jsonb,
        research_version=$8,
        research_source_hash=$9,
        researched_at=CASE WHEN $4 IN ('researched','insufficient','conflict','failed') THEN now() ELSE researched_at END,
        updated_at=now()
    WHERE id=$1::uuid AND source_hash=$2 AND status='pending'
  `,[
    claimed.id,claimed.sourceHash,JSON.stringify(identifiers),research.status,JSON.stringify(research.identity),
    JSON.stringify({ version: research.version,facts: research.facts }),JSON.stringify(research.sources),research.version,research.sourceHash
  ]);
}

async function claimNext(scope: GenerationScope): Promise<ClaimedEnrichment | null> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH candidate AS (
      SELECT ce.id
      FROM public.catalogue_enrichments ce
      WHERE ce.status='pending'
        AND ce.source_product_id IS NOT NULL
        AND ce.generation_attempt_count < $1
        AND (ce.processing_lease_until IS NULL OR ce.processing_lease_until < now())
        AND ($2::boolean OR ce.external_product_id = ANY($3::text[]))
      ORDER BY (ce.family_id IS NULL),ce.updated_at,ce.id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE public.catalogue_enrichments ce
    SET processing_lease_until=now()+interval '4 minutes',generation_attempt_count=ce.generation_attempt_count+1,
        last_attempt_at=now(),last_error=NULL,updated_at=now()
    FROM candidate WHERE ce.id=candidate.id
    RETURNING ce.id,ce.external_product_id,ce.source_product_id,ce.source_hash,ce.family_id,
      ce.verified_facts,ce.fact_provenance,ce.generation_attempt_count,
      ce.research_status,ce.research_source_hash,ce.research_evidence,ce.research_identity,ce.research_sources
  `,[scope.maxAttempts,scope.allowAll,[...scope.productIds]]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: requiredText(row.id,"enrichment id"),externalProductId: requiredText(row.external_product_id,"external product id"),
    sourceProductId: requiredText(row.source_product_id,"source product id"),sourceHash: requiredText(row.source_hash,"source hash"),
    familyId: nullableText(row.family_id),facts: parseFacts(row.verified_facts),provenance: parseProvenance(row.fact_provenance),
    attemptCount: requiredInteger(row.generation_attempt_count,"generation attempt count"),
    researchStatus: nullableText(row.research_status) ?? "not_requested",researchSourceHash: nullableText(row.research_source_hash),
    researchEvidence: record(row.research_evidence),researchIdentity: record(row.research_identity),
    researchSources: Array.isArray(row.research_sources) ? row.research_sources : []
  };
}

async function sourceEvidence(sourceProductId: string): Promise<{ payload: Readonly<Record<string,unknown>> } | null> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT normalized_payload FROM public.catalog_source_products WHERE id=$1::uuid LIMIT 1
  `,[sourceProductId]);
  return result.rows[0] ? { payload: record(result.rows[0].normalized_payload) } : null;
}

async function persistAcceptedCandidate(
  claimed: ClaimedEnrichment,generated: CatalogueGenerationResult,bazaar: BazaarPresentationOverlay,
  identifiers: CatalogueProductIdentifiers,research: ResearchContext,coverage: EvidenceCoverageReport
): Promise<boolean> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    UPDATE public.catalogue_enrichments
    SET status='enriched',display_title_el=$3,display_short_description_el=$4,display_description_el=$5,
        display_title_en=NULL,display_short_description_en=NULL,display_description_en=NULL,
        generation_provider=$6,generation_model=$7,generation_request_id=$8,generation_metadata=$9::jsonb,
        generation_candidate=$10::jsonb,validation_errors='[]'::jsonb,prompt_version=$11,
        identifiers=$12::jsonb,research_status=$13,research_identity=$14::jsonb,research_evidence=$15::jsonb,
        research_sources=$16::jsonb,research_version=$17,research_source_hash=$18,evidence_coverage=$19::jsonb,
        quality_version=$20,enrichment_version=enrichment_version+1,generated_at=now(),validated_at=now(),
        processing_lease_until=NULL,last_error=NULL,updated_at=now()
    WHERE id=$1::uuid AND source_hash=$2 AND status='pending' AND generation_attempt_count=$21 RETURNING id
  `,[claimed.id,claimed.sourceHash,generated.draft.titleEl,generated.draft.shortDescriptionEl,generated.draft.descriptionEl,
    generated.telemetry.provider,generated.telemetry.model,generated.telemetry.requestId,
    JSON.stringify({ usage: generated.telemetry.usage,bazaar,researchStatus:research.status }),JSON.stringify(generated.draft),
    generated.telemetry.promptVersion,JSON.stringify(identifiers),research.status,JSON.stringify(research.identity),
    JSON.stringify({ version:research.version,facts:research.facts }),JSON.stringify(research.sources),research.version,research.sourceHash,
    JSON.stringify(coverage),QUALITY_VERSION,claimed.attemptCount]);
  return (result.rowCount ?? result.rows.length) > 0;
}

async function persistRejectedCandidate(
  claimed: ClaimedEnrichment,generated: CatalogueGenerationResult,bazaar: BazaarPresentationOverlay,
  validationErrors: readonly string[],identifiers: CatalogueProductIdentifiers,research: ResearchContext,coverage: EvidenceCoverageReport
): Promise<boolean> {
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    UPDATE public.catalogue_enrichments
    SET status='needs_review',generation_provider=$3,generation_model=$4,generation_request_id=$5,
        generation_metadata=$6::jsonb,generation_candidate=$7::jsonb,validation_errors=$8::jsonb,prompt_version=$9,
        identifiers=$10::jsonb,research_status=$11,research_identity=$12::jsonb,research_evidence=$13::jsonb,
        research_sources=$14::jsonb,research_version=$15,research_source_hash=$16,evidence_coverage=$17::jsonb,
        quality_version=NULL,generated_at=now(),validated_at=now(),processing_lease_until=NULL,last_error='validation_failed',updated_at=now()
    WHERE id=$1::uuid AND source_hash=$2 AND status='pending' AND generation_attempt_count=$18 RETURNING id
  `,[claimed.id,claimed.sourceHash,generated.telemetry.provider,generated.telemetry.model,generated.telemetry.requestId,
    JSON.stringify({ usage: generated.telemetry.usage,bazaar,researchStatus:research.status }),JSON.stringify(generated.draft),
    JSON.stringify(validationErrors),generated.telemetry.promptVersion,JSON.stringify(identifiers),research.status,JSON.stringify(research.identity),
    JSON.stringify({ version:research.version,facts:research.facts }),JSON.stringify(research.sources),research.version,research.sourceHash,
    JSON.stringify(coverage),claimed.attemptCount]);
  return (result.rowCount ?? result.rows.length) > 0;
}

async function markGenerationFailure(claimed: ClaimedEnrichment,error: string,maxAttempts: number,forceTerminal: boolean): Promise<boolean> {
  const terminal = forceTerminal || claimed.attemptCount >= maxAttempts;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    UPDATE public.catalogue_enrichments
    SET status=CASE WHEN $4::boolean THEN 'failed' ELSE 'pending' END,
        processing_lease_until=CASE WHEN $4::boolean THEN NULL ELSE now()+interval '10 minutes' END,
        last_error=$3,updated_at=now()
    WHERE id=$1::uuid AND source_hash=$2 AND generation_attempt_count=$5 RETURNING id
  `,[claimed.id,claimed.sourceHash,error.slice(0,500),terminal,claimed.attemptCount]);
  return (result.rowCount ?? result.rows.length) > 0;
}

async function releaseStaleClaim(claimed: ClaimedEnrichment): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalogue_enrichments SET processing_lease_until=NULL,updated_at=now()
    WHERE id=$1::uuid AND generation_attempt_count=$2 AND status='pending'
  `,[claimed.id,claimed.attemptCount]);
}

function generationScope(env: NodeJS.ProcessEnv): GenerationScope {
  const enabled = catalogueAiEnrichmentEnabled(env);
  const allowAll = enabled && env.BLS_CATALOGUE_AI_ENRICHMENT_ALLOW_ALL === "true";
  const productIds = [...new Set((env.BLS_CATALOGUE_AI_ENRICHMENT_PRODUCT_IDS ?? "").split(",").map((value) => value.trim()).filter((value) => value.length > 0 && value.length <= 160))];
  return {
    enabled,allowAll,productIds,
    batchSize: boundedPositiveInteger(env.BLS_CATALOGUE_AI_ENRICHMENT_BATCH_SIZE,DEFAULT_BATCH_SIZE,MAX_BATCH_SIZE),
    maxAttempts: boundedPositiveInteger(env.BLS_CATALOGUE_AI_MAX_ATTEMPTS,DEFAULT_MAX_ATTEMPTS,10)
  };
}

function parseResearchFacts(value: Readonly<Record<string,unknown>>): CatalogueResearchFact[] {
  const facts = Array.isArray(value.facts) ? value.facts : [];
  return facts.flatMap((item) => {
    const row = record(item); const category = text(row.category); const factValue = text(row.value); const sourceUrl = text(row.sourceUrl) ?? text(row.source_url);
    return category && factValue && sourceUrl ? [{ category,value:factValue,sourceUrl }] : [];
  });
}

function parseFacts(value: unknown): VerifiedProductFacts {
  const row = record(value); const dimensionsRaw = record(row.dimensions); const dimensions: Record<string,string|number> = {};
  for (const [key,item] of Object.entries(dimensionsRaw)) if ((typeof item === "string" && item.trim()) || (typeof item === "number" && Number.isFinite(item))) dimensions[key]=item as string|number;
  return {
    brand: nullableText(row.brand),model: nullableText(row.model),productType: nullableText(row.productType),color: nullableText(row.color),
    materials: stringArray(row.materials),dimensions,season: nullableText(row.season),gender: nullableText(row.gender),condition: nullableText(row.condition),
    features: stringArray(row.features),claims: stringArray(row.claims)
  };
}

function parseProvenance(value: unknown): FactProvenance {
  const row = record(value);
  return Object.fromEntries(Object.entries(row).flatMap(([key,item]) => { const values=stringArray(item); return values.length ? [[key,values] as const] : []; }));
}
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []) : []; }
function requiredText(value: unknown,label: string): string { const valueText=text(value); if (!valueText) throw new Error(`${label} is required`); return valueText; }
function nullableText(value: unknown): string | null { return text(value); }
function text(value: unknown): string | null { if (typeof value === "string" && value.trim()) return value.trim(); if (typeof value === "number" && Number.isFinite(value)) return String(value); return null; }
function requiredInteger(value: unknown,label: string): number { const parsed=Number(value); if (!Number.isSafeInteger(parsed)||parsed<0) throw new Error(`${label} must be a nonnegative integer`); return parsed; }
function boundedPositiveInteger(raw: string|undefined,fallback: number,maximum: number): number { if (!raw?.trim()) return fallback; const value=Number(raw); return Number.isSafeInteger(value)&&value>0 ? Math.min(value,maximum) : fallback; }
function record(value: unknown): Readonly<Record<string,unknown>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string,unknown>> : {}; }
function safeError(error: unknown): string { return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).replace(/\s+/g," ").slice(0,500); }
function emptyResult(enabled:boolean,scope:"disabled"|"pilot"|"all",message:string): CatalogueEnrichmentGenerationSliceResult { return { enabled,scope,claimed:0,enriched:0,needsReview:0,failed:0,message }; }

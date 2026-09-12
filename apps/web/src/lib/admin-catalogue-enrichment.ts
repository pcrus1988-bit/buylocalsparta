import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  type BazaarPresentationOverlay,
  type CatalogueEnrichmentDraft,
  type FactProvenance,
  type VerifiedProductFacts
} from "./catalogue-enrichment";
import { sanitizeSupplierEvidenceText, validateLuxuryCatalogueDraft } from "./catalogue-enrichment-policy";

export type CatalogueEnrichmentStatus = "pending" | "enriched" | "needs_review" | "failed";

export type CatalogueEnrichmentQueueItem = Readonly<{
  id: string;
  externalProductId: string;
  supplierName: string;
  status: CatalogueEnrichmentStatus;
  brand?: string;
  model?: string;
  productType?: string;
  sourceTitle?: string;
  displayTitle?: string;
  candidateTitle?: string;
  validationErrorCount: number;
  attemptCount: number;
  modelName?: string;
  promptVersion?: string;
  updatedAt: string;
}>;

export type CatalogueEnrichmentDetail = Readonly<{
  id: string;
  externalProductId: string;
  supplierName: string;
  status: CatalogueEnrichmentStatus;
  familyId?: string;
  sourceProductId?: string;
  sourceHash: string;
  sourceTitle?: string;
  sourceDescription?: string;
  verifiedFacts: VerifiedProductFacts;
  factProvenance: FactProvenance;
  deterministicFallback: Readonly<Record<string, unknown>>;
  bazaarOverlay: BazaarPresentationOverlay;
  display: CatalogueEnrichmentDraft;
  candidate: CatalogueEnrichmentDraft;
  validationErrors: readonly string[];
  attemptCount: number;
  generationProvider?: string;
  generationModel?: string;
  generationRequestId?: string;
  promptVersion?: string;
  rulesVersion: string;
  lastError?: string;
  generatedAt?: string;
  validatedAt?: string;
  updatedAt: string;
}>;

export type CatalogueEnrichmentWorkspace = Readonly<{
  csrfToken: string;
  counts: Readonly<Record<CatalogueEnrichmentStatus, number>>;
  queue: readonly CatalogueEnrichmentQueueItem[];
  selected?: CatalogueEnrichmentDetail;
}>;

export async function adminCatalogueEnrichmentWorkspace(
  principal: SessionPrincipal,
  input: { status?: CatalogueEnrichmentStatus; query?: string; itemId?: string } = {}
): Promise<CatalogueEnrichmentWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) {
    return { csrfToken: principal.csrfToken, counts: emptyCounts(), queue: [] };
  }
  const status = input.status;
  const query = input.query?.trim().slice(0, 120) || undefined;
  const itemId = input.itemId?.trim() || undefined;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 2_000 });

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [countRows, queueRows, detailRows] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT status,count(*)::integer AS count
        FROM public.catalogue_enrichments
        GROUP BY status
      `),
      tx.query<SqlRow>(`
        SELECT ce.id::text AS id,ce.external_product_id,ce.status,ce.verified_facts,
               ce.validation_errors,ce.generation_attempt_count,ce.generation_model,ce.prompt_version,
               ce.display_title_el,ce.generation_candidate,ce.updated_at,
               ds.display_name AS supplier_name,sp.title AS source_title
        FROM public.catalogue_enrichments ce
        JOIN public.dropship_suppliers ds ON ds.id=ce.supplier_id
        LEFT JOIN public.catalog_source_products sp ON sp.id=ce.source_product_id
        WHERE ($1::text IS NULL OR ce.status=$1)
          AND ($2::text IS NULL OR ce.external_product_id ILIKE '%'||$2||'%'
               OR COALESCE(sp.title,'') ILIKE '%'||$2||'%'
               OR COALESCE(ce.verified_facts->>'brand','') ILIKE '%'||$2||'%'
               OR COALESCE(ce.verified_facts->>'model','') ILIKE '%'||$2||'%')
        ORDER BY CASE ce.status WHEN 'needs_review' THEN 0 WHEN 'failed' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
                 ce.updated_at DESC,ce.id
        LIMIT 100
      `,[status ?? null,query ?? null]),
      itemId ? tx.query<SqlRow>(`
        SELECT ce.*,ce.id::text AS id_text,ce.family_id::text AS family_id_text,
               ce.source_product_id::text AS source_product_id_text,
               ds.display_name AS supplier_name,sp.title AS source_title,sp.normalized_payload AS source_payload
        FROM public.catalogue_enrichments ce
        JOIN public.dropship_suppliers ds ON ds.id=ce.supplier_id
        LEFT JOIN public.catalog_source_products sp ON sp.id=ce.source_product_id
        WHERE ce.id=$1::uuid
        LIMIT 1
      `,[itemId]) : Promise.resolve({ rows: [] } as { rows: SqlRow[] })
    ]);

    const counts = emptyCounts();
    for (const row of countRows.rows) {
      const key = statusValue(row.status);
      if (key) counts[key] = integer(row.count);
    }
    return {
      csrfToken: principal.csrfToken,
      counts,
      queue: queueRows.rows.map(mapQueueItem),
      selected: detailRows.rows[0] ? mapDetail(detailRows.rows[0]) : undefined
    };
  }, { readOnly: true, statementTimeoutMs: 20_000 });
}

export async function requeueCatalogueEnrichment(
  principal: SessionPrincipal,
  input: { id: string; reason?: string }
): Promise<void> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const id = input.id.trim();
  if (!id) throw new Error("Enrichment record is required");
  const reason = input.reason?.trim().slice(0, 300) || "Requeued from Admin catalogue enrichment QA";
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 3_000 });
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      UPDATE public.catalogue_enrichments
      SET status='pending',validation_errors='[]'::jsonb,generation_candidate='{}'::jsonb,
          generation_attempt_count=0,last_attempt_at=NULL,processing_lease_until=NULL,last_error=NULL,
          validated_at=NULL,updated_at=now(),
          generation_metadata=COALESCE(generation_metadata,'{}'::jsonb)||jsonb_build_object(
            'adminRequeuedBy',$2::text,'adminRequeuedAt',now()::text,'adminRequeueReason',$3::text)
      WHERE id=$1::uuid
      RETURNING id
    `,[id,principal.userId,reason]);
    if ((result.rowCount ?? 0) !== 1) throw new Error("Enrichment record was not found");
  });
  await recordAdminAudit(principal,"catalogue.enrichment.requeued","catalogue_enrichment",id,reason,{});
}

export async function saveCatalogueEnrichmentDraft(
  principal: SessionPrincipal,
  input: { id: string; titleEl: string; shortDescriptionEl?: string; descriptionEl?: string; reason?: string }
): Promise<{ status: "enriched" | "needs_review"; validationErrors: readonly string[] }> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const id = input.id.trim();
  if (!id) throw new Error("Enrichment record is required");
  const reason = input.reason?.trim().slice(0, 300) || "Reviewed from Admin catalogue enrichment QA";
  const draft: CatalogueEnrichmentDraft = {
    titleEl: input.titleEl.trim(),
    shortDescriptionEl: optionalText(input.shortDescriptionEl) ?? null,
    descriptionEl: optionalText(input.descriptionEl) ?? null,
    titleEn: null,
    shortDescriptionEn: null,
    descriptionEn: null
  };
  if (!draft.titleEl) throw new Error("Greek title is required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });
  const outcome = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const selected = await tx.query<SqlRow>(`
      SELECT ce.verified_facts,ce.bazaar_overlay,sp.title AS source_title,sp.normalized_payload AS source_payload
      FROM public.catalogue_enrichments ce
      LEFT JOIN public.catalog_source_products sp ON sp.id=ce.source_product_id
      WHERE ce.id=$1::uuid
      FOR UPDATE OF ce
    `,[id]);
    const row = selected.rows[0];
    if (!row) throw new Error("Enrichment record was not found");
    const facts = parseFacts(row.verified_facts);
    const bazaar = parseBazaar(row.bazaar_overlay);
    const sourcePayload = record(row.source_payload);
    const validationErrors = validateLuxuryCatalogueDraft({
      facts,
      draft,
      sourceTitle: sanitizeSupplierEvidenceText(row.source_title,800),
      sourceDescription: sanitizeSupplierEvidenceText(sourcePayload.description,6000),
      bazaar
    });
    const accepted = validationErrors.length === 0;
    await tx.query(`
      UPDATE public.catalogue_enrichments
      SET status=CASE WHEN $3::boolean THEN 'enriched' ELSE 'needs_review' END,
          display_title_el=CASE WHEN $3::boolean THEN $4 ELSE display_title_el END,
          display_short_description_el=CASE WHEN $3::boolean THEN $5 ELSE display_short_description_el END,
          display_description_el=CASE WHEN $3::boolean THEN $6 ELSE display_description_el END,
          generation_candidate=$7::jsonb,validation_errors=$8::jsonb,
          last_error=CASE WHEN $3::boolean THEN NULL ELSE 'manual_validation_failed' END,
          validated_at=now(),processing_lease_until=NULL,
          enrichment_version=CASE WHEN $3::boolean THEN enrichment_version+1 ELSE enrichment_version END,
          generation_metadata=COALESCE(generation_metadata,'{}'::jsonb)||jsonb_build_object(
            'adminReviewedBy',$2::text,'adminReviewedAt',now()::text,'adminReviewReason',$9::text,
            'adminReviewAccepted',$3::boolean),
          updated_at=now()
      WHERE id=$1::uuid
    `,[id,principal.userId,accepted,draft.titleEl,draft.shortDescriptionEl,draft.descriptionEl,JSON.stringify(draft),JSON.stringify(validationErrors),reason]);
    return { status: accepted ? "enriched" as const : "needs_review" as const, validationErrors };
  });
  await recordAdminAudit(principal,"catalogue.enrichment.manual_review","catalogue_enrichment",id,reason,{status:outcome.status,validationErrors:outcome.validationErrors});
  return outcome;
}

function mapQueueItem(row: SqlRow): CatalogueEnrichmentQueueItem {
  const facts = parseFacts(row.verified_facts);
  const candidate = parseDraft(row.generation_candidate);
  return {
    id: requiredText(row.id,"enrichment.id"),
    externalProductId: requiredText(row.external_product_id,"external product id"),
    supplierName: requiredText(row.supplier_name,"supplier name"),
    status: requiredStatus(row.status),
    brand: facts.brand ?? undefined,
    model: facts.model ?? undefined,
    productType: facts.productType ?? undefined,
    sourceTitle: optionalText(row.source_title),
    displayTitle: optionalText(row.display_title_el),
    candidateTitle: candidate.titleEl || undefined,
    validationErrorCount: stringArray(row.validation_errors).length,
    attemptCount: integer(row.generation_attempt_count),
    modelName: optionalText(row.generation_model),
    promptVersion: optionalText(row.prompt_version),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapDetail(row: SqlRow): CatalogueEnrichmentDetail {
  const sourcePayload = record(row.source_payload);
  return {
    id: requiredText(row.id_text,"enrichment.id"),
    externalProductId: requiredText(row.external_product_id,"external product id"),
    supplierName: requiredText(row.supplier_name,"supplier name"),
    status: requiredStatus(row.status),
    familyId: optionalText(row.family_id_text),
    sourceProductId: optionalText(row.source_product_id_text),
    sourceHash: requiredText(row.source_hash,"source hash"),
    sourceTitle: optionalText(row.source_title) ?? optionalText(sourcePayload.name),
    sourceDescription: sanitizeSupplierEvidenceText(sourcePayload.description,6000) ?? undefined,
    verifiedFacts: parseFacts(row.verified_facts),
    factProvenance: parseProvenance(row.fact_provenance),
    deterministicFallback: record(row.deterministic_fallback),
    bazaarOverlay: parseBazaar(row.bazaar_overlay),
    display: {
      titleEl: optionalText(row.display_title_el) ?? "",
      shortDescriptionEl: optionalText(row.display_short_description_el) ?? null,
      descriptionEl: optionalText(row.display_description_el) ?? null,
      titleEn: optionalText(row.display_title_en) ?? null,
      shortDescriptionEn: optionalText(row.display_short_description_en) ?? null,
      descriptionEn: optionalText(row.display_description_en) ?? null
    },
    candidate: parseDraft(row.generation_candidate),
    validationErrors: stringArray(row.validation_errors),
    attemptCount: integer(row.generation_attempt_count),
    generationProvider: optionalText(row.generation_provider),
    generationModel: optionalText(row.generation_model),
    generationRequestId: optionalText(row.generation_request_id),
    promptVersion: optionalText(row.prompt_version),
    rulesVersion: requiredText(row.rules_version,"rules version"),
    lastError: optionalText(row.last_error),
    generatedAt: optionalTimestamp(row.generated_at),
    validatedAt: optionalTimestamp(row.validated_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function parseDraft(value: unknown): CatalogueEnrichmentDraft {
  const row = record(value);
  return {
    titleEl: optionalText(row.titleEl) ?? optionalText(row.title_el) ?? "",
    shortDescriptionEl: optionalText(row.shortDescriptionEl) ?? optionalText(row.short_description_el) ?? null,
    descriptionEl: optionalText(row.descriptionEl) ?? optionalText(row.description_el) ?? null,
    titleEn: optionalText(row.titleEn) ?? optionalText(row.title_en) ?? null,
    shortDescriptionEn: optionalText(row.shortDescriptionEn) ?? optionalText(row.short_description_en) ?? null,
    descriptionEn: optionalText(row.descriptionEn) ?? optionalText(row.description_en) ?? null
  };
}

function parseFacts(value: unknown): VerifiedProductFacts {
  const row = record(value);
  const dimensionRow = record(row.dimensions);
  const dimensions: Record<string,string|number> = {};
  for (const [key,item] of Object.entries(dimensionRow)) {
    if (typeof item === "number" && Number.isFinite(item)) dimensions[key]=item;
    else if (typeof item === "string" && item.trim()) dimensions[key]=item.trim();
  }
  return {
    brand: optionalText(row.brand) ?? null,
    model: optionalText(row.model) ?? null,
    productType: optionalText(row.productType) ?? null,
    color: optionalText(row.color) ?? null,
    materials: stringArray(row.materials),
    dimensions,
    season: optionalText(row.season) ?? null,
    gender: optionalText(row.gender) ?? null,
    condition: optionalText(row.condition) ?? null,
    features: stringArray(row.features),
    claims: stringArray(row.claims)
  };
}

function parseProvenance(value: unknown): FactProvenance {
  return Object.fromEntries(Object.entries(record(value)).flatMap(([key,item]) => {
    const values=stringArray(item);return values.length ? [[key,values] as const] : [];
  }));
}

function parseBazaar(value: unknown): BazaarPresentationOverlay {
  const row=record(value);
  const channel=row.commerceChannel === "bazaar" ? "bazaar" : "normal";
  return { commerceChannel:channel,condition:optionalText(row.condition) ?? "new",bazaarSource:optionalText(row.bazaarSource),supplierCondition:optionalText(row.supplierCondition) };
}

function emptyCounts(): Record<CatalogueEnrichmentStatus,number> { return {pending:0,enriched:0,needs_review:0,failed:0}; }
function statusValue(value:unknown):CatalogueEnrichmentStatus|undefined { const text=String(value??"");return ["pending","enriched","needs_review","failed"].includes(text) ? text as CatalogueEnrichmentStatus : undefined; }
function requiredStatus(value:unknown):CatalogueEnrichmentStatus { const status=statusValue(value);if(!status) throw new Error("Invalid enrichment status");return status; }
function record(value:unknown):Readonly<Record<string,unknown>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string,unknown>> : {}; }
function requiredText(value:unknown,label:string):string { const text=optionalText(value);if(!text) throw new Error(`${label} is required`);return text; }
function optionalText(value:unknown):string|undefined { if(typeof value === "string" && value.trim()) return value.trim();if(typeof value === "number" && Number.isFinite(value)) return String(value);return undefined; }
function stringArray(value:unknown):string[] { return Array.isArray(value) ? value.flatMap((item)=>typeof item === "string" && item.trim() ? [item.trim()] : []) : []; }
function integer(value:unknown):number { const parsed=Number(value??0);return Number.isFinite(parsed)?Math.max(0,Math.trunc(parsed)):0; }
function timestamp(value:unknown):string { if(value instanceof Date) return value.toISOString();const parsed=new Date(String(value??""));return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString(); }
function optionalTimestamp(value:unknown):string|undefined { const result=timestamp(value);return result||undefined; }

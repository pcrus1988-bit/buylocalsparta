import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueIntelligenceProposalKind =
  | "category_new"
  | "category_ambiguous"
  | "attribute_new"
  | "attribute_ambiguous"
  | "attribute_contract_missing";

export type CatalogueIntelligenceSourceOption = Readonly<{
  id: string;
  code: string;
  name: string;
  openCount: number;
}>;

export type CatalogueIntelligenceCategoryOption = Readonly<{
  id: string;
  code: string;
  name: string;
}>;

export type CatalogueIntelligenceAttributeTarget = Readonly<{
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  attributeId: string;
  attributeCode: string;
  attributeName: string;
  dataType: string;
  unit?: string;
}>;

export type CatalogueIntelligenceProposal = Readonly<{
  id: string;
  kind: CatalogueIntelligenceProposalKind;
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  snapshotId?: string;
  sourceTaxonomyNodeId?: string;
  sourceLabel?: string;
  sourceKey?: string;
  sourcePath: readonly string[];
  sourceAttributeKey?: string;
  scopeKind?: "taxonomy_node" | "source_category";
  scopeKey?: string;
  candidateCategoryId?: string;
  candidateCategoryCode?: string;
  candidateCategoryName?: string;
  candidateAttributeId?: string;
  candidateAttributeCode?: string;
  candidateAttributeName?: string;
  candidateProductTypeId?: string;
  candidateProductTypeCode?: string;
  candidateProductTypeName?: string;
  confidence?: number;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  proposedPayload: unknown;
  evidence: unknown;
}>;

export type CatalogueIntelligenceReviewWorkspace = Readonly<{
  csrfToken: string;
  totalOpen: number;
  categoryOpen: number;
  attributeOpen: number;
  ambiguousOpen: number;
  sourceId?: string;
  kind?: CatalogueIntelligenceProposalKind;
  sources: readonly CatalogueIntelligenceSourceOption[];
  categories: readonly CatalogueIntelligenceCategoryOption[];
  attributeTargets: readonly CatalogueIntelligenceAttributeTarget[];
  proposals: readonly CatalogueIntelligenceProposal[];
}>;

export async function adminCatalogueIntelligenceReviewWorkspace(
  principal: SessionPrincipal,
  input: { sourceId?: string; kind?: string } = {}
): Promise<CatalogueIntelligenceReviewWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  const sourceId = cleanUuid(input.sourceId);
  const kind = proposalKind(input.kind);
  if (!postgresAdminRuntimeEnabled()) {
    return {
      csrfToken: principal.csrfToken,
      totalOpen: 0,
      categoryOpen: 0,
      attributeOpen: 0,
      ambiguousOpen: 0,
      sourceId,
      kind,
      sources: [],
      categories: [],
      attributeTargets: [],
      proposals: []
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [proposalRows, sourceRows, categoryRows, targetRows, metricRows] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT p.id::text AS id,
               p.proposal_kind,
               p.source_id::text AS source_id,
               s.code AS source_code,
               s.name AS source_name,
               p.snapshot_id::text AS snapshot_id,
               p.source_taxonomy_node_id::text AS source_taxonomy_node_id,
               n.source_label,
               n.source_key,
               COALESCE(n.path_labels,ARRAY[]::text[]) AS source_path,
               p.source_attribute_key,
               p.scope_kind,
               p.scope_key,
               p.candidate_category_id::text AS candidate_category_id,
               cc.code AS candidate_category_code,
               COALESCE(NULLIF(cct.name,''),cc.code) AS candidate_category_name,
               p.candidate_attribute_id::text AS candidate_attribute_id,
               ca.code AS candidate_attribute_code,
               COALESCE(NULLIF(cat.label,''),ca.code) AS candidate_attribute_name,
               p.candidate_product_type_id::text AS candidate_product_type_id,
               cpt.code AS candidate_product_type_code,
               COALESCE(NULLIF(cptt.name,''),cpt.code) AS candidate_product_type_name,
               p.confidence,
               p.occurrence_count,
               p.first_seen_at,
               p.last_seen_at,
               p.proposed_payload,
               p.evidence
        FROM public.catalog_intelligence_proposals p
        JOIN public.catalog_sources s ON s.id=p.source_id
        LEFT JOIN public.catalog_source_taxonomy_nodes n ON n.id=p.source_taxonomy_node_id
        LEFT JOIN public.categories cc ON cc.id=p.candidate_category_id
        LEFT JOIN public.category_translations cct ON cct.category_id=cc.id AND upper(cct.locale)='EL'
        LEFT JOIN public.attribute_definitions ca ON ca.id=p.candidate_attribute_id
        LEFT JOIN public.attribute_translations cat ON cat.attribute_id=ca.id AND upper(cat.locale)='EL'
        LEFT JOIN public.product_types cpt ON cpt.id=p.candidate_product_type_id
        LEFT JOIN public.product_type_translations cptt ON cptt.product_type_id=cpt.id AND upper(cptt.locale)='EL'
        WHERE p.status='open'
          AND ($1::uuid IS NULL OR p.source_id=$1::uuid)
          AND ($2::text IS NULL OR p.proposal_kind=$2::text)
        ORDER BY p.last_seen_at DESC,p.occurrence_count DESC,p.id
        LIMIT 250
      `, [sourceId ?? null, kind ?? null]),
      tx.query<SqlRow>(`
        SELECT s.id::text AS id,s.code,s.name,count(p.id)::integer AS open_count
        FROM public.catalog_sources s
        JOIN public.catalog_intelligence_proposals p ON p.source_id=s.id AND p.status='open'
        GROUP BY s.id,s.code,s.name
        ORDER BY count(p.id) DESC,s.name,s.code
      `),
      tx.query<SqlRow>(`
        SELECT c.id::text AS id,c.code,
               COALESCE(NULLIF(ct.name,''),c.code) AS name
        FROM public.categories c
        LEFT JOIN public.category_translations ct ON ct.category_id=c.id AND upper(ct.locale)='EL'
        WHERE c.active=true AND c.assignable=true
        ORDER BY COALESCE(NULLIF(ct.name,''),c.code),c.code,c.id
        LIMIT 3000
      `),
      tx.query<SqlRow>(`
        SELECT pt.id::text AS product_type_id,
               pt.code AS product_type_code,
               COALESCE(NULLIF(ptt.name,''),pt.code) AS product_type_name,
               ad.id::text AS attribute_id,
               ad.code AS attribute_code,
               COALESCE(NULLIF(at.label,''),ad.code) AS attribute_name,
               ad.data_type,
               COALESCE(pta.unit_override,ad.unit) AS effective_unit
        FROM public.product_type_attributes pta
        JOIN public.product_types pt ON pt.id=pta.product_type_id AND pt.status='active'
        JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
        LEFT JOIN public.product_type_translations ptt ON ptt.product_type_id=pt.id AND upper(ptt.locale)='EL'
        LEFT JOIN public.attribute_translations at ON at.attribute_id=ad.id AND upper(at.locale)='EL'
        ORDER BY COALESCE(NULLIF(ptt.name,''),pt.code),pta.sort_order,ad.code,ad.id
        LIMIT 6000
      `),
      tx.query<SqlRow>(`
        SELECT count(*)::integer AS total_open,
               count(*) FILTER (WHERE proposal_kind LIKE 'category_%')::integer AS category_open,
               count(*) FILTER (WHERE proposal_kind LIKE 'attribute_%')::integer AS attribute_open,
               count(*) FILTER (WHERE proposal_kind IN ('category_ambiguous','attribute_ambiguous'))::integer AS ambiguous_open
        FROM public.catalog_intelligence_proposals
        WHERE status='open'
          AND ($1::uuid IS NULL OR source_id=$1::uuid)
      `, [sourceId ?? null])
    ]);

    const metrics = metricRows.rows[0] ?? {};
    return {
      csrfToken: principal.csrfToken,
      totalOpen: integer(metrics.total_open),
      categoryOpen: integer(metrics.category_open),
      attributeOpen: integer(metrics.attribute_open),
      ambiguousOpen: integer(metrics.ambiguous_open),
      sourceId,
      kind,
      sources: sourceRows.rows.map((row) => ({
        id: required(row.id,"source.id"),
        code: required(row.code,"source.code"),
        name: required(row.name,"source.name"),
        openCount: integer(row.open_count)
      })),
      categories: categoryRows.rows.map((row) => ({
        id: required(row.id,"category.id"),
        code: required(row.code,"category.code"),
        name: required(row.name,"category.name")
      })),
      attributeTargets: targetRows.rows.map((row) => ({
        productTypeId: required(row.product_type_id,"product type.id"),
        productTypeCode: required(row.product_type_code,"product type.code"),
        productTypeName: required(row.product_type_name,"product type.name"),
        attributeId: required(row.attribute_id,"attribute.id"),
        attributeCode: required(row.attribute_code,"attribute.code"),
        attributeName: required(row.attribute_name,"attribute.name"),
        dataType: required(row.data_type,"attribute.data_type"),
        unit: optional(row.effective_unit)
      })),
      proposals: proposalRows.rows.map(mapProposal)
    };
  }, { readOnly: true, statementTimeoutMs: 20_000 });
}

export async function approveAdminCatalogueIntelligenceProposal(
  principal: SessionPrincipal,
  input: { proposalId: string; categoryId?: string; mappingTarget?: string }
): Promise<{ proposalId: string; kind: CatalogueIntelligenceProposalKind; result: unknown }> {
  assertAdminPermission(principal,"catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const proposalId=cleanUuid(input.proposalId);
  if (!proposalId) throw new Error("A valid proposal is required");
  const categoryId=cleanUuid(input.categoryId);
  const [productTypeRaw,attributeRaw]=String(input.mappingTarget ?? "").split("|");
  const productTypeId=cleanUuid(productTypeRaw);
  const attributeId=cleanUuid(attributeRaw);

  const runtime=getProductionPostgresRuntime();
  const uow=new PostgresUnitOfWork(runtime.sqlPool,{statementTimeoutMs:30_000,lockTimeoutMs:3_000});
  const outcome=await uow.withTransaction(platformScope(principal.userId),async(tx)=>{
    const proposalResult=await tx.query<SqlRow>(`
      SELECT proposal_kind
      FROM public.catalog_intelligence_proposals
      WHERE id=$1::uuid AND status='open'
      FOR UPDATE
    `,[proposalId]);
    const kind=proposalKind(proposalResult.rows[0]?.proposal_kind);
    if(!kind) throw new Error("Open catalogue intelligence proposal was not found");
    if(kind.startsWith("category_")){
      if(!categoryId) throw new Error("Choose an existing KONTAMOU category before approving this proposal");
      const result=await tx.query<SqlRow>(`
        SELECT bls_private.approve_catalog_intelligence_proposal(
          $1::uuid,$2::uuid,$3::uuid,NULL,NULL
        ) AS result
      `,[proposalId,principal.userId,categoryId]);
      return {proposalId,kind,result:result.rows[0]?.result};
    }
    if(!productTypeId||!attributeId) throw new Error("Choose an existing Product Type / attribute contract before approving this proposal");
    const result=await tx.query<SqlRow>(`
      SELECT bls_private.approve_catalog_intelligence_proposal(
        $1::uuid,$2::uuid,NULL,$3::uuid,$4::uuid
      ) AS result
    `,[proposalId,principal.userId,attributeId,productTypeId]);
    return {proposalId,kind,result:result.rows[0]?.result};
  });

  await recordAdminAudit(principal,"catalogue.intelligence_proposal.approved","catalog_intelligence_proposal",proposalId,"Approved from catalogue intelligence review",outcome.result);
  return outcome;
}

export async function rejectAdminCatalogueIntelligenceProposal(
  principal: SessionPrincipal,
  input: { proposalId: string; reason: string }
): Promise<{ proposalId: string; result: unknown }> {
  assertAdminPermission(principal,"catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const proposalId=cleanUuid(input.proposalId);
  const reason=input.reason.trim();
  if(!proposalId) throw new Error("A valid proposal is required");
  if(!reason) throw new Error("A rejection reason is required");
  if(reason.length>500) throw new Error("Rejection reason must be 500 characters or fewer");

  const runtime=getProductionPostgresRuntime();
  const uow=new PostgresUnitOfWork(runtime.sqlPool,{statementTimeoutMs:15_000,lockTimeoutMs:3_000});
  const result=await uow.withTransaction(platformScope(principal.userId),async(tx)=>{
    const response=await tx.query<SqlRow>(`
      SELECT bls_private.reject_catalog_intelligence_proposal($1::uuid,$2::uuid,$3::text) AS result
    `,[proposalId,principal.userId,reason]);
    return response.rows[0]?.result;
  });
  await recordAdminAudit(principal,"catalogue.intelligence_proposal.rejected","catalog_intelligence_proposal",proposalId,reason,result);
  return {proposalId,result};
}

function mapProposal(row: SqlRow): CatalogueIntelligenceProposal {
  const kind=proposalKind(row.proposal_kind);
  if(!kind) throw new Error(`Unsupported catalogue intelligence proposal kind: ${String(row.proposal_kind ?? "")}`);
  return {
    id: required(row.id,"proposal.id"),
    kind,
    sourceId: required(row.source_id,"source.id"),
    sourceCode: required(row.source_code,"source.code"),
    sourceName: required(row.source_name,"source.name"),
    snapshotId: optional(row.snapshot_id),
    sourceTaxonomyNodeId: optional(row.source_taxonomy_node_id),
    sourceLabel: optional(row.source_label),
    sourceKey: optional(row.source_key),
    sourcePath: arrayStrings(row.source_path),
    sourceAttributeKey: optional(row.source_attribute_key),
    scopeKind: optional(row.scope_kind) as CatalogueIntelligenceProposal["scopeKind"],
    scopeKey: optional(row.scope_key),
    candidateCategoryId: optional(row.candidate_category_id),
    candidateCategoryCode: optional(row.candidate_category_code),
    candidateCategoryName: optional(row.candidate_category_name),
    candidateAttributeId: optional(row.candidate_attribute_id),
    candidateAttributeCode: optional(row.candidate_attribute_code),
    candidateAttributeName: optional(row.candidate_attribute_name),
    candidateProductTypeId: optional(row.candidate_product_type_id),
    candidateProductTypeCode: optional(row.candidate_product_type_code),
    candidateProductTypeName: optional(row.candidate_product_type_name),
    confidence: decimal(row.confidence),
    occurrenceCount: integer(row.occurrence_count),
    firstSeenAt: required(row.first_seen_at,"proposal.first_seen_at"),
    lastSeenAt: required(row.last_seen_at,"proposal.last_seen_at"),
    proposedPayload: row.proposed_payload ?? {},
    evidence: row.evidence ?? {}
  };
}

function proposalKind(value: unknown): CatalogueIntelligenceProposalKind | undefined {
  const text=String(value ?? "").trim();
  if(["category_new","category_ambiguous","attribute_new","attribute_ambiguous","attribute_contract_missing"].includes(text)) return text as CatalogueIntelligenceProposalKind;
  return undefined;
}
function cleanUuid(value: unknown): string | undefined {
  const text=String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)?text:undefined;
}
function required(value: unknown,name:string): string { const text=String(value ?? "").trim(); if(!text) throw new Error(`${name} is required`); return text; }
function optional(value: unknown): string | undefined { const text=String(value ?? "").trim(); return text||undefined; }
function integer(value: unknown): number { const n=Number(value ?? 0); return Number.isFinite(n)?Math.trunc(n):0; }
function decimal(value: unknown): number | undefined { if(value==null||value==="") return undefined; const n=Number(value); return Number.isFinite(n)?n:undefined; }
function arrayStrings(value: unknown): string[] { return Array.isArray(value)?value.map((item)=>String(item ?? "").trim()).filter(Boolean):[]; }

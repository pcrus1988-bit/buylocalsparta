import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueManualReviewTypeCount = Readonly<{ dataType: string; count: number }>;
export type CatalogueManualReviewSourceCount = Readonly<{ sourceId: string; sourceName: string; unmapped: number; reviewRequired: number }>;
export type CatalogueManualReviewTarget = Readonly<{
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  attributeId: string;
  attributeCode: string;
  dataType: string;
  unit?: string;
}>;
export type CatalogueManualReviewGroup = Readonly<{
  representativeObservationId: string;
  representativeSourceProductId: string;
  sourceId: string;
  sourceName: string;
  sourceAttributeKey: string;
  contextLabel: string;
  productTypeId?: string;
  productTypeCode?: string;
  attributeId?: string;
  attributeCode?: string;
  dataType: string;
  canonicalUnit?: string;
  sourceUnit?: string;
  rawValue: unknown;
  normalizedValue: unknown;
  mappingReason?: string;
  observationCount: number;
  productCount: number;
  sampleTitles: readonly string[];
  canApproveAsIs: boolean;
  needsControlledValue: boolean;
}>;
export type CatalogueManualReviewWorkspace = Readonly<{
  csrfToken: string;
  totalReviewRequired: number;
  groups: readonly CatalogueManualReviewGroup[];
  typeCounts: readonly CatalogueManualReviewTypeCount[];
  sourceCounts: readonly CatalogueManualReviewSourceCount[];
  selectedTargets: readonly CatalogueManualReviewTarget[];
}>;

export async function adminCatalogueManualReviewWorkspace(
  principal: SessionPrincipal,
  input: { snapshotId?: string; dataType?: string; selectedObservationId?: string } = {}
): Promise<CatalogueManualReviewWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  const snapshotId = input.snapshotId?.trim() || undefined;
  const dataType = input.dataType?.trim() || undefined;
  const selectedObservationId = input.selectedObservationId?.trim() || undefined;
  if (!postgresAdminRuntimeEnabled()) {
    return { csrfToken: principal.csrfToken, totalReviewRequired: 0, groups: [], typeCounts: [], sourceCounts: [], selectedTargets: [] };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [groupRows, totalRows, typeRows, sourceRows, targetRows] = await Promise.all([
      tx.query<SqlRow>(`
        WITH base AS (
          SELECT a.id,a.source_product_id,a.source_attribute_key,a.attribute_id,a.raw_value,a.normalized_value,
                 NULLIF(btrim(a.source_unit),'') AS source_unit,a.metadata,
                 sp.snapshot_id,sp.source_id,sp.source_taxonomy_node_id,sp.title,
                 COALESCE(NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')) AS provider_category,
                 s.name AS source_name,t.path_labels,
                 ad.code AS attribute_code,COALESCE(ad.data_type,'unassigned') AS data_type,ad.unit AS canonical_unit,
                 COALESCE(NULLIF(a.metadata->>'productTypeId',''),r.product_type_id::text) AS product_type_id,
                 pt.code AS product_type_code,
                 COALESCE(a.metadata->>'mappingReason',a.metadata->>'mapping_reason',a.metadata->>'artifactReason') AS mapping_reason
          FROM public.catalog_source_attribute_observations a
          JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
          JOIN public.catalog_sources s ON s.id=sp.source_id
          LEFT JOIN public.catalog_source_taxonomy_nodes t ON t.id=sp.source_taxonomy_node_id
          LEFT JOIN public.attribute_definitions ad ON ad.id=a.attribute_id
          LEFT JOIN public.catalog_source_attribute_mapping_rules r ON r.id::text=a.metadata->>'mappingRuleId'
          LEFT JOIN public.product_types pt ON pt.id::text=COALESCE(NULLIF(a.metadata->>'productTypeId',''),r.product_type_id::text)
          WHERE a.mapping_status='review_required'
            AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
        ), scoped AS (
          SELECT b.*,
                 CASE WHEN b.source_taxonomy_node_id IS NOT NULL THEN 'taxonomy_node' WHEN b.provider_category IS NOT NULL THEN 'source_category' ELSE 'unscoped' END AS scope_kind,
                 CASE WHEN b.source_taxonomy_node_id IS NOT NULL THEN b.source_taxonomy_node_id::text WHEN b.provider_category IS NOT NULL THEN b.provider_category ELSE NULL END AS scope_key,
                 CASE WHEN b.source_taxonomy_node_id IS NOT NULL THEN COALESCE(NULLIF(array_to_string(b.path_labels,' › '),''),'Supplier taxonomy node') WHEN b.provider_category IS NOT NULL THEN 'Provider category · '||b.provider_category ELSE 'No stable source category' END AS context_label
          FROM base b
        )
        SELECT min(id::text) AS representative_observation_id,
               min(source_product_id::text) AS representative_source_product_id,
               source_id::text AS source_id,min(source_name) AS source_name,source_attribute_key,
               scope_kind,scope_key,min(context_label) AS context_label,
               product_type_id,min(product_type_code) AS product_type_code,
               attribute_id::text AS attribute_id,min(attribute_code) AS attribute_code,data_type,min(canonical_unit) AS canonical_unit,
               source_unit,raw_value,normalized_value,mapping_reason,
               count(*)::integer AS observation_count,count(DISTINCT source_product_id)::integer AS product_count,
               (array_agg(DISTINCT title ORDER BY title))[1:4] AS sample_titles
        FROM scoped
        WHERE ($2::text IS NULL OR data_type=$2::text)
        GROUP BY source_id,source_attribute_key,scope_kind,scope_key,product_type_id,attribute_id,data_type,source_unit,raw_value,normalized_value,mapping_reason
        ORDER BY count(*) DESC,min(source_name),source_attribute_key
        LIMIT 120
      `, [snapshotId ?? null, dataType ?? null]),
      tx.query<SqlRow>(`
        SELECT count(*)::integer AS total
        FROM public.catalog_source_attribute_observations a
        JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
        LEFT JOIN public.attribute_definitions ad ON ad.id=a.attribute_id
        WHERE a.mapping_status='review_required'
          AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
          AND ($2::text IS NULL OR COALESCE(ad.data_type,'unassigned')=$2::text)
      `, [snapshotId ?? null, dataType ?? null]),
      tx.query<SqlRow>(`
        SELECT COALESCE(ad.data_type,'unassigned') AS data_type,count(*)::integer AS count
        FROM public.catalog_source_attribute_observations a
        JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
        LEFT JOIN public.attribute_definitions ad ON ad.id=a.attribute_id
        WHERE a.mapping_status='review_required' AND ($1::uuid IS NULL OR sp.snapshot_id=$1::uuid)
        GROUP BY COALESCE(ad.data_type,'unassigned') ORDER BY count(*) DESC
      `, [snapshotId ?? null]),
      tx.query<SqlRow>(`
        SELECT s.id::text AS source_id,s.name AS source_name,
               count(*) FILTER (WHERE a.mapping_status='unmapped' AND a.attribute_id IS NULL)::integer AS unmapped,
               count(*) FILTER (WHERE a.mapping_status='review_required')::integer AS review_required
        FROM public.catalog_sources s
        JOIN public.catalog_source_products sp ON sp.source_id=s.id
        JOIN public.catalog_source_attribute_observations a ON a.source_product_id=sp.id
        GROUP BY s.id,s.name
        HAVING count(*) FILTER (WHERE a.mapping_status IN ('unmapped','review_required'))>0
        ORDER BY s.name
      `),
      selectedObservationId ? tx.query<SqlRow>(`
        WITH selected AS (
          SELECT sp.source_taxonomy_node_id,
                 COALESCE(NULLIF(a.metadata->>'productTypeId',''),r.product_type_id::text) AS current_product_type_id
          FROM public.catalog_source_attribute_observations a
          JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
          LEFT JOIN public.catalog_source_attribute_mapping_rules r ON r.id::text=a.metadata->>'mappingRuleId'
          WHERE a.id=$1::uuid AND a.mapping_status='review_required'
        ), allowed_types AS (
          SELECT DISTINCT cpt.product_type_id
          FROM selected x
          JOIN public.catalog_source_category_mappings m ON m.source_taxonomy_node_id=x.source_taxonomy_node_id AND m.mapping_status='approved'
          JOIN public.category_product_types cpt ON cpt.category_id=m.category_id
          UNION
          SELECT pt.id FROM selected x JOIN public.product_types pt ON pt.id::text=x.current_product_type_id
        )
        SELECT pt.id::text AS product_type_id,pt.code AS product_type_code,
               COALESCE(NULLIF(ptt.name,''),pt.code) AS product_type_name,
               ad.id::text AS attribute_id,ad.code AS attribute_code,ad.data_type,COALESCE(pta.unit_override,ad.unit) AS effective_unit
        FROM allowed_types allowed
        JOIN public.product_types pt ON pt.id=allowed.product_type_id AND pt.status='active'
        JOIN public.product_type_attributes pta ON pta.product_type_id=pt.id
        JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
        LEFT JOIN public.product_type_translations ptt ON ptt.product_type_id=pt.id AND upper(ptt.locale)='EL'
        ORDER BY COALESCE(NULLIF(ptt.name,''),pt.code),pta.sort_order,ad.code
        LIMIT 800
      `, [selectedObservationId]) : Promise.resolve({ rows: [] } as { rows: SqlRow[] })
    ]);

    return {
      csrfToken: principal.csrfToken,
      totalReviewRequired: integer(totalRows.rows[0]?.total),
      groups: groupRows.rows.map(mapGroup),
      typeCounts: typeRows.rows.map((row) => ({ dataType: required(row.data_type,"data type"), count: integer(row.count) })),
      sourceCounts: sourceRows.rows.map((row) => ({ sourceId: required(row.source_id,"source.id"), sourceName: required(row.source_name,"source.name"), unmapped: integer(row.unmapped), reviewRequired: integer(row.review_required) })),
      selectedTargets: targetRows.rows.map((row) => ({
        productTypeId: required(row.product_type_id,"product type.id"),productTypeCode: required(row.product_type_code,"product type.code"),productTypeName: required(row.product_type_name,"product type.name"),
        attributeId: required(row.attribute_id,"attribute.id"),attributeCode: required(row.attribute_code,"attribute.code"),dataType: required(row.data_type,"attribute.data_type"),unit: optional(row.effective_unit)
      }))
    };
  }, { readOnly: true, statementTimeoutMs: 20_000 });
}

export async function resolveCatalogueManualReview(
  principal: SessionPrincipal,
  input: {
    observationId: string;
    decision: "approve" | "reject";
    canonicalValue?: string;
    reason?: string;
    applyToExactMatches?: boolean;
    productTypeId?: string;
    attributeId?: string;
  }
): Promise<{ changed: number; action: "approved" | "rejected"; attributeCode?: string }> {
  assertAdminPermission(principal, "catalog.write");
  if (!postgresAdminRuntimeEnabled()) throw new Error("Postgres catalogue runtime is not enabled");
  const observationId=input.observationId.trim();
  if(!observationId) throw new Error("Observation is required");
  const reason=input.reason?.trim() || (input.decision==="reject" ? "Rejected during manual Supplier PIM review" : "Approved during manual Supplier PIM review");
  const runtime=getProductionPostgresRuntime();
  const uow=new PostgresUnitOfWork(runtime.sqlPool,{statementTimeoutMs:20_000,lockTimeoutMs:3_000});

  const result=await uow.withTransaction(platformScope(principal.userId),async(tx)=>{
    const selectedResult=await tx.query<SqlRow>(`
      SELECT a.id::text AS id,a.attribute_id::text AS attribute_id,a.raw_value,a.normalized_value,a.source_unit,a.metadata,
             a.source_attribute_key,sp.source_id::text AS source_id,sp.source_taxonomy_node_id::text AS taxonomy_node_id,
             COALESCE(NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')) AS provider_category,
             ad.code AS attribute_code,ad.data_type,ad.unit AS canonical_unit,
             COALESCE(NULLIF(a.metadata->>'productTypeId',''),r.product_type_id::text) AS current_product_type_id
      FROM public.catalog_source_attribute_observations a
      JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
      LEFT JOIN public.attribute_definitions ad ON ad.id=a.attribute_id
      LEFT JOIN public.catalog_source_attribute_mapping_rules r ON r.id::text=a.metadata->>'mappingRuleId'
      WHERE a.id=$1::uuid AND a.mapping_status='review_required'
      FOR UPDATE OF a
    `,[observationId]);
    const selected=selectedResult.rows[0];
    if(!selected) throw new Error("This review item is no longer pending");

    let targetAttributeId=optional(selected.attribute_id);
    let targetAttributeCode=optional(selected.attribute_code);
    let targetDataType=optional(selected.data_type) ?? "unassigned";
    let targetUnit=optional(selected.canonical_unit);
    const requestedAttributeId=input.attributeId?.trim();
    const requestedProductTypeId=input.productTypeId?.trim();
    if(requestedAttributeId || requestedProductTypeId){
      if(!requestedAttributeId || !requestedProductTypeId) throw new Error("Product Type and canonical attribute must be selected together");
      const targetResult=await tx.query<SqlRow>(`
        SELECT ad.id::text AS attribute_id,ad.code AS attribute_code,ad.data_type,COALESCE(pta.unit_override,ad.unit) AS effective_unit,pt.code AS product_type_code
        FROM public.product_type_attributes pta
        JOIN public.product_types pt ON pt.id=pta.product_type_id AND pt.status='active'
        JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
        WHERE pta.product_type_id=$1::uuid AND pta.attribute_id=$2::uuid LIMIT 1
      `,[requestedProductTypeId,requestedAttributeId]);
      const target=targetResult.rows[0];
      if(!target) throw new Error("Selected Product Type / attribute contract is not active");
      const taxonomyNodeId=optional(selected.taxonomy_node_id);
      if(taxonomyNodeId){
        const allowed=await tx.query<SqlRow>(`
          SELECT 1 FROM public.catalog_source_category_mappings m
          JOIN public.category_product_types cpt ON cpt.category_id=m.category_id AND cpt.product_type_id=$2::uuid
          WHERE m.source_taxonomy_node_id=$1::uuid AND m.mapping_status='approved' LIMIT 1
        `,[taxonomyNodeId,requestedProductTypeId]);
        if(allowed.rowCount===0) throw new Error("Selected Product Type is not allowed by the approved KONTAMOU category for this supplier context");
      }
      targetAttributeId=required(target.attribute_id,"attribute.id");targetAttributeCode=required(target.attribute_code,"attribute.code");targetDataType=required(target.data_type,"attribute.data_type");targetUnit=optional(target.effective_unit);
    }

    const applyExact=input.applyToExactMatches===true;
    if(input.decision==="reject"){
      const update=await tx.query<SqlRow>(`
        WITH selected AS (
          SELECT a.id,a.attribute_id,a.raw_value,a.normalized_value,a.source_unit,a.source_attribute_key,
                 sp.source_id,sp.source_taxonomy_node_id,
                 COALESCE(NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')) AS provider_category
          FROM public.catalog_source_attribute_observations a JOIN public.catalog_source_products sp ON sp.id=a.source_product_id WHERE a.id=$1::uuid
        ), targets AS (
          SELECT a2.id FROM selected x
          JOIN public.catalog_source_products sp2 ON sp2.source_id=x.source_id
          JOIN public.catalog_source_attribute_observations a2 ON a2.source_product_id=sp2.id
          WHERE a2.mapping_status='review_required' AND a2.source_attribute_key=x.source_attribute_key
            AND a2.attribute_id IS NOT DISTINCT FROM x.attribute_id AND a2.raw_value IS NOT DISTINCT FROM x.raw_value
            AND a2.normalized_value IS NOT DISTINCT FROM x.normalized_value AND a2.source_unit IS NOT DISTINCT FROM x.source_unit
            AND (($2::boolean=false AND a2.id=x.id) OR ($2::boolean=true AND ((x.source_taxonomy_node_id IS NOT NULL AND sp2.source_taxonomy_node_id=x.source_taxonomy_node_id) OR (x.source_taxonomy_node_id IS NULL AND sp2.source_taxonomy_node_id IS NULL AND COALESCE(NULLIF(btrim(sp2.source_identity->>'categoryId'),''),NULLIF(btrim(sp2.source_identity->>'category_id'),''),NULLIF(btrim(sp2.normalized_payload->>'sourceCategoryId'),'')) IS NOT DISTINCT FROM x.provider_category))))
        )
        UPDATE public.catalog_source_attribute_observations a SET mapping_status='rejected',confidence=1,
          metadata=a.metadata||jsonb_build_object('manualReviewDecision','rejected','manualReviewReason',$3::text,'manualReviewedBy',$4::text,'manualReviewedAt',now()::text,'rawEvidencePreserved',true)
        WHERE a.id IN (SELECT id FROM targets) RETURNING a.id::text
      `,[observationId,applyExact,reason,principal.userId]);
      return {changed:update.rowCount,action:"rejected" as const,attributeCode:targetAttributeCode};
    }

    if(!targetAttributeId) throw new Error("Choose a canonical Product Type / attribute before approving this item");
    if(targetDataType==="enum") throw new Error("Controlled enum values must be approved in the Controlled Values queue");
    const canonicalValue=parseCanonicalValue(targetDataType,input.canonicalValue,selected.normalized_value);
    if(canonicalValue===undefined || canonicalValue===null) throw new Error("A canonical value is required before approval");
    if(!input.canonicalValue?.trim() && targetUnit && optional(selected.source_unit) && normalizeUnit(targetUnit)!==normalizeUnit(optional(selected.source_unit))) {
      throw new Error(`Source unit ${optional(selected.source_unit)} differs from canonical unit ${targetUnit}. Enter the corrected canonical value explicitly.`);
    }

    const update=await tx.query<SqlRow>(`
      WITH selected AS (
        SELECT a.id,a.attribute_id,a.raw_value,a.normalized_value,a.source_unit,a.source_attribute_key,
               sp.source_id,sp.source_taxonomy_node_id,
               COALESCE(NULLIF(btrim(sp.source_identity->>'categoryId'),''),NULLIF(btrim(sp.source_identity->>'category_id'),''),NULLIF(btrim(sp.normalized_payload->>'sourceCategoryId'),'')) AS provider_category
        FROM public.catalog_source_attribute_observations a JOIN public.catalog_source_products sp ON sp.id=a.source_product_id WHERE a.id=$1::uuid
      ), targets AS (
        SELECT a2.id FROM selected x
        JOIN public.catalog_source_products sp2 ON sp2.source_id=x.source_id
        JOIN public.catalog_source_attribute_observations a2 ON a2.source_product_id=sp2.id
        WHERE a2.mapping_status='review_required' AND a2.source_attribute_key=x.source_attribute_key
          AND a2.attribute_id IS NOT DISTINCT FROM x.attribute_id AND a2.raw_value IS NOT DISTINCT FROM x.raw_value
          AND a2.normalized_value IS NOT DISTINCT FROM x.normalized_value AND a2.source_unit IS NOT DISTINCT FROM x.source_unit
          AND (($2::boolean=false AND a2.id=x.id) OR ($2::boolean=true AND ((x.source_taxonomy_node_id IS NOT NULL AND sp2.source_taxonomy_node_id=x.source_taxonomy_node_id) OR (x.source_taxonomy_node_id IS NULL AND sp2.source_taxonomy_node_id IS NULL AND COALESCE(NULLIF(btrim(sp2.source_identity->>'categoryId'),''),NULLIF(btrim(sp2.source_identity->>'category_id'),''),NULLIF(btrim(sp2.normalized_payload->>'sourceCategoryId'),'')) IS NOT DISTINCT FROM x.provider_category))))
      )
      UPDATE public.catalog_source_attribute_observations a SET attribute_id=$5::uuid,normalized_value=$6::jsonb,mapping_status='mapped',confidence=1,
        metadata=a.metadata||jsonb_build_object('manualReviewDecision','approved','manualReviewReason',$3::text,'manualReviewedBy',$4::text,'manualReviewedAt',now()::text,'manualCanonicalUnit',$7::text,'rawEvidencePreserved',true,'productTypeId',COALESCE(NULLIF($8::text,''),a.metadata->>'productTypeId'))
      WHERE a.id IN (SELECT id FROM targets) RETURNING a.id::text
    `,[observationId,applyExact,reason,principal.userId,targetAttributeId,JSON.stringify(canonicalValue),targetUnit ?? "",requestedProductTypeId ?? optional(selected.current_product_type_id) ?? ""]);
    return {changed:update.rowCount,action:"approved" as const,attributeCode:targetAttributeCode};
  });

  await recordAdminAudit(principal,`catalogue.source_attribute_observation.manual_${result.action}`,"catalog_source_attribute_observation",observationId,reason,{changed:result.changed,applyToExactMatches:input.applyToExactMatches===true,attributeCode:result.attributeCode});
  return result;
}

function mapGroup(row: SqlRow): CatalogueManualReviewGroup {
  const dataType=required(row.data_type,"data type");
  const canonicalUnit=optional(row.canonical_unit);const sourceUnit=optional(row.source_unit);const attributeId=optional(row.attribute_id);
  const normalized=row.normalized_value;
  const canApproveAsIs=Boolean(attributeId && normalized!==null && dataType!=="enum" && dataType!=="unassigned" && isCompatibleCanonicalValue(dataType,normalized) && (!canonicalUnit || !sourceUnit || normalizeUnit(canonicalUnit)===normalizeUnit(sourceUnit)));
  return {
    representativeObservationId:required(row.representative_observation_id,"observation.id"),representativeSourceProductId:required(row.representative_source_product_id,"source product.id"),
    sourceId:required(row.source_id,"source.id"),sourceName:required(row.source_name,"source.name"),sourceAttributeKey:required(row.source_attribute_key,"source attribute key"),contextLabel:required(row.context_label,"context label"),
    productTypeId:optional(row.product_type_id),productTypeCode:optional(row.product_type_code),attributeId,attributeCode:optional(row.attribute_code),dataType,canonicalUnit,sourceUnit,rawValue:row.raw_value,normalizedValue:normalized,
    mappingReason:optional(row.mapping_reason),observationCount:integer(row.observation_count),productCount:integer(row.product_count),sampleTitles:arrayStrings(row.sample_titles),canApproveAsIs,needsControlledValue:dataType==="enum"
  };
}
function parseCanonicalValue(dataType:string,input:string|undefined,fallback:unknown):unknown {
  const text=input?.trim();
  if(!text){
    if(dataType==="number"){const value=Number(fallback);return Number.isFinite(value)?value:undefined;}
    if(dataType==="boolean"){if(fallback===true||fallback==="true") return true;if(fallback===false||fallback==="false") return false;return undefined;}
    return fallback;
  }
  if(dataType==="number"){const value=Number(text.replace(",","."));if(!Number.isFinite(value)) throw new Error("Enter a valid canonical number");return value;}
  if(dataType==="boolean"){if(["true","1","yes","ναι"].includes(text.toLowerCase())) return true;if(["false","0","no","όχι"].includes(text.toLowerCase())) return false;throw new Error("Enter true/false for a boolean attribute");}
  if(dataType==="multienum"){
    if(text.startsWith("[")){const parsed=JSON.parse(text);if(!Array.isArray(parsed)||parsed.some((item)=>typeof item!=="string")) throw new Error("Multienum JSON must be an array of strings");return parsed;}
    return text.split(/[;,]/).map((item)=>item.trim()).filter(Boolean);
  }
  return text;
}
function isCompatibleCanonicalValue(dataType:string,value:unknown):boolean {
  if(value===null||value===undefined) return false;
  if(dataType==="number") return typeof value==="number" && Number.isFinite(value);
  if(dataType==="boolean") return typeof value==="boolean";
  if(dataType==="multienum") return Array.isArray(value) && value.length>0 && value.every((item)=>typeof item==="string" && item.trim().length>0);
  if(dataType==="dimension"||dataType==="text") return typeof value==="string" && value.trim().length>0;
  return false;
}
function normalizeUnit(value:string|undefined):string { return (value??"").trim().toLowerCase().replaceAll("²","2").replaceAll("³","3").replace(/\s+/g,""); }
function required(value:unknown,name:string):string { const text=String(value??"").trim();if(!text) throw new Error(`${name} is required`);return text; }
function optional(value:unknown):string|undefined { const text=String(value??"").trim();return text||undefined; }
function integer(value:unknown):number { const parsed=Number(value??0);return Number.isFinite(parsed)?Math.max(0,Math.trunc(parsed)):0; }
function arrayStrings(value:unknown):string[]{ return Array.isArray(value)?value.map((item)=>String(item)).filter(Boolean):[]; }

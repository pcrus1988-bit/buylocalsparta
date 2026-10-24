import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { rawResearchAnswerAccess } from "./research-survey-response-admin";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { GREECE_REGIONS } from "./research-geographic-core";
import { resolveResearchAdministrativeGeography } from "./research-postcode-geography";
import {
  RESEARCH_RELATIONSHIP_PRESETS, aggregateRelationship, relationshipAnswerCoverage,
  relationshipAnswerCoverageByRegion,
  safeRelationshipCounts, safeRelationshipRegion,
  type RelationshipPair, type SafeRelationshipRegion, type SafeRelationshipCounts
} from "./research-geographic-relations-core";

export type RelationshipChoice = Readonly<{ key:string; label:string }>;
export type RelationshipQuestion = Readonly<{
  code:string; label:string; type:"single"|"multi"|"scale"; options:readonly RelationshipChoice[];
}>;
export type RelationshipFilters = Readonly<{
  mode:"all"|"draft"|"completed"; phase:"main"|"pilot"; sector:string; kad:string; region:string;
  view:"segment"|"other"|"gap"; compare:string;
  preset:string; a:string; av:string; b:string; bv:string;
}>;
export type ResearchRelationshipDashboard = Readonly<{
  title:string; capturedAt:string; filters:RelationshipFilters;
  pair:RelationshipPair;
  questions:readonly RelationshipQuestion[];
  sectors:readonly RelationshipChoice[];
  kads:readonly RelationshipChoice[];
  regions:readonly SafeRelationshipRegion[];
  nationalSegment:SafeRelationshipCounts; nationalOther:SafeRelationshipCounts;
  unknownGeography:boolean; totalMatchedBase: number | null;
  /** All saved answer contributions, revealed only to analysis/management admins. */
  coverage: ReturnType<typeof relationshipAnswerCoverage> | null;
  regionalCoverage: ReturnType<typeof relationshipAnswerCoverageByRegion> | null;
  canViewExactSmallCells: boolean;
}>;

const SLUG=/^[a-z0-9][a-z0-9-]{2,79}$/;
const text=(v:unknown)=>v==null?"":String(v);
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v?:string,limit=100)=>String(v??"").trim().slice(0,limit);
const pairs=(value:unknown):RelationshipChoice[]=>Array.isArray(value)
 ? value.flatMap(item=>Array.isArray(item)&&item.length>=2?[{key:String(item[0]),label:String(item[1])}]:[]):[];
export const SECTOR_LABELS: Record<string,string>={
  fashion_footwear:"Ένδυση / υπόδηση",home_living:"Σπίτι / διακόσμηση",
  beauty_personal_care:"Ομορφιά / φροντίδα",diy_building:"Εργαλεία / οικοδομικά",
  other_non_food_retail:"Λοιπό λιανεμπόριο",sports_books_hobby:"Αθλητικά / βιβλία / χόμπι",
  automotive_trade:"Αυτοκίνητο",electronics:"Ηλεκτρονικά",flowers_pets:"Άνθη / κατοικίδια",
  jewellery_watches:"Κοσμήματα / ρολόγια",second_hand:"Μεταχειρισμένα"
};
export function questionChoices(row:SqlRow):RelationshipChoice[]{
  const cfg=obj(row.config);
  if(row.question_type!=="scale")return pairs(cfg.options);
  const min=Number(cfg.min??1),max=Number(cfg.max??5),step=Number(cfg.step??1);
  if(!Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(step)
    ||step<=0||max<min||(max-min)/step>20)return [];
  return Array.from({length:Math.floor((max-min)/step)+1},(_,i)=>{
    const key=String(min+i*step);return {key,label:key};
  });
}
/** Only questionnaire-defined answers can define a relation. Never accept a raw SQL fragment. */
function resolvePair(questions:readonly RelationshipQuestion[],input:Record<string,string|undefined>):
  {pair:RelationshipPair;preset:string; a:string;av:string;b:string;bv:string}{
  const preset=RESEARCH_RELATIONSHIP_PRESETS.find(item=>item.id===input.preset)
    ?? RESEARCH_RELATIONSHIP_PRESETS[0];
  const custom=input.preset==="custom";
  if(custom){
    const a=questions.find(q=>q.code===str(input.a,16));
    const b=questions.find(q=>q.code===str(input.b,16));
    const av=a?.options.find(x=>x.key===str(input.av,80));
    const bv=b?.options.find(x=>x.key===str(input.bv,80));
    if(a&&b&&a.code!==b.code&&av&&bv&&av.key!=="unknown"&&bv.key!=="unknown"){
      return {
        preset:"custom",a:a.code,av:av.key,b:b.code,bv:bv.key,
        pair:{a:a.code,av:[av.key],aLabel:a.code+": "+av.label,
          b:b.code,bv:[bv.key],bLabel:b.code+": "+bv.label,
          insight:"Τι απαντούν σε μία δεύτερη ερώτηση όσοι ανήκουν στην επιλεγμένη πρώτη ομάδα;"}
      };
    }
  }
  const validA=questions.find(q=>q.code===preset.a);
  const validB=questions.find(q=>q.code===preset.b);
  if(!validA||!validB)throw new Error("The selected instrument does not contain the required questions.");
  const av=preset.av.filter(v=>validA.options.some(o=>o.key===v));
  const bv=preset.bv.filter(v=>validB.options.some(o=>o.key===v));
  if(!av.length||!bv.length)throw new Error("Preset answer choices missing from instrument.");
  return {preset:preset.id,a:preset.a,av:av.join(","),b:preset.b,bv:bv.join(","),
    pair:{a:preset.a,av,aLabel:preset.aLabel,b:preset.b,bv,bLabel:preset.bLabel,insight:preset.insight}};
}

/**
 * Read-only cross-tabulation. Joins *two questions for the same response ID*;
 * answer completeness is a pairwise condition, not a join between different
 * businesses. No raw answers, IDs, email addresses, map pins or addresses
 * leave this server function. All transmitted aggregates are redacted.
 */
export async function researchRelationshipMap(
  principal:SessionPrincipal,slug:string,input:Record<string,string|undefined>
):Promise<ResearchRelationshipDashboard|undefined>{
  assertAdminPermission(principal,"research.read");
  if(!productionDatabaseConfigured()||!SLUG.test(slug))return undefined;
  const pool=getAdminPostgresRuntime().sqlPool;
  const studies=await pool.query<SqlRow>([
    "SELECT s.id AS study_id,s.title,i.id AS instrument_id",
    "FROM research_studies s LEFT JOIN LATERAL (",
    " SELECT id FROM research_instruments WHERE study_id=s.id AND wave_id=s.current_wave_id",
    " ORDER BY CASE WHEN status='fielding' THEN 0 ELSE 1 END,created_at DESC LIMIT 1",
    ") i ON true WHERE s.slug=$1 LIMIT 1"
  ].join("\n"),[slug]);
  const study=studies.rows[0];
  if(!study?.instrument_id)return undefined;
  const [qr,sr,kr]=await Promise.all([
    pool.query<SqlRow>([
      "SELECT code,prompt_el,question_type,config,id FROM research_questions",
      "WHERE instrument_id=$1 AND question_type IN ('single','multi','scale')",
      "ORDER BY position LIMIT 80"
    ].join("\n"),[study.instrument_id]),
    pool.query<SqlRow>([
      "SELECT DISTINCT COALESCE(fu.sector_code,ctx.sector_code) AS code FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "LEFT JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "LEFT JOIN research_response_design_context ctx ON ctx.response_id=r.id",
      "WHERE r.study_id=$1 AND NULLIF(COALESCE(fu.sector_code,ctx.sector_code),'') IS NOT NULL",
      "ORDER BY 1 LIMIT 40"
    ].join("\n"),[study.study_id]),
    pool.query<SqlRow>([
      "SELECT matched.code, count(*) AS n FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "LEFT JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "LEFT JOIN research_response_design_context ctx ON ctx.response_id=r.id",
      "CROSS JOIN LATERAL jsonb_array_elements_text(",
      " CASE WHEN jsonb_typeof(COALESCE(fu.sampling_attributes->'matchedActivityCodes',ctx.matched_kad_codes))='array'",
      " THEN COALESCE(fu.sampling_attributes->'matchedActivityCodes',ctx.matched_kad_codes) ELSE '[]'::jsonb END) AS matched(code)",
      "WHERE r.study_id=$1 GROUP BY matched.code ORDER BY n DESC,matched.code LIMIT 100"
    ].join("\n"),[study.study_id])
  ]);
  const questions:RelationshipQuestion[]=qr.rows.map(row=>({
    code:text(row.code),label:text(row.prompt_el),type:row.question_type as RelationshipQuestion["type"],
    options:questionChoices(row)
  })).filter(q=>q.options.length>0);
  const resolved=resolvePair(questions,input);
  const sectorOptions=sr.rows.map(row=>({
    key:text(row.code),label:SECTOR_LABELS[text(row.code)]??text(row.code)
  }));
  const sector=sectorOptions.some(x=>x.key===input.sector)?str(input.sector):"";
  const kadOptions=kr.rows.map(row=>({key:text(row.code),label:text(row.code)}));
  const kad=kadOptions.some(x=>x.key===input.kad)?str(input.kad):"";
  const region=GREECE_REGIONS.some(r=>r.key===input.region)?str(input.region,60):"";
  const compare=GREECE_REGIONS.some(r=>r.key===input.compare)?str(input.compare,60):"";
  const view=input.view==="gap"||input.view==="other"?input.view:"segment";
  const mode=input.mode==="completed"?"completed":input.mode==="draft"?"draft":"all";
  const phase=input.phase==="pilot"?"pilot":"main";
  const qa=qr.rows.find(q=>q.code===resolved.a);
  const qb=qr.rows.find(q=>q.code===resolved.b);
  if(!qa||!qb)return undefined;

  // Include ALL saved, non-withdrawn answers, whether formally submitted or
  // still in progress. n(A), n(B) and n(A∩B) are separate actual response bases.
  // The conditional rate only uses A∩B: a missing answer cannot be inferred.
  // Unknown/none responses are recorded answers, not silently discarded.
  const records=await pool.query<SqlRow>([
    "WITH labeled AS (",
    " SELECT COALESCE(NULLIF(fu.sampling_attributes->>'prefecture',''),NULLIF(ctx.source_prefecture,''),'') AS prefecture, COALESCE(fu.sampling_attributes->>'postcode','') AS postcode,",
    "   CASE WHEN jsonb_typeof(a.answer)='array' THEN jsonb_array_length(a.answer)>0",
    "     WHEN jsonb_typeof(a.answer)='string' THEN btrim(a.answer #>> '{}')<>''",
    "     WHEN jsonb_typeof(a.answer) IN ('number','boolean') THEN true",
    "     ELSE false END AS has_a,",
    "   CASE WHEN jsonb_typeof(b.answer)='array' THEN jsonb_array_length(b.answer)>0",
    "     WHEN jsonb_typeof(b.answer)='string' THEN btrim(b.answer #>> '{}')<>''",
    "     WHEN jsonb_typeof(b.answer) IN ('number','boolean') THEN true",
    "     ELSE false END AS has_b,",
    "   CASE WHEN jsonb_typeof(a.answer)='array'",
    "       THEN CASE WHEN jsonb_array_length(a.answer)>0 THEN a.answer ?| $7::text[] ELSE NULL END",
    "     WHEN jsonb_typeof(a.answer)='string' AND btrim(a.answer #>> '{}')<>''",
    "       THEN a.answer #>> '{}' = ANY($7::text[])",
    "     WHEN jsonb_typeof(a.answer) IN ('number','boolean')",
    "       THEN a.answer #>> '{}' = ANY($7::text[])",
    "     ELSE NULL END AS segment,",
    "   CASE WHEN jsonb_typeof(b.answer)='array'",
    "       THEN CASE WHEN jsonb_array_length(b.answer)>0 THEN b.answer ?| $8::text[] ELSE NULL END",
    "     WHEN jsonb_typeof(b.answer)='string' AND btrim(b.answer #>> '{}')<>''",
    "       THEN b.answer #>> '{}' = ANY($8::text[])",
    "     WHEN jsonb_typeof(b.answer) IN ('number','boolean')",
    "       THEN b.answer #>> '{}' = ANY($8::text[])",
    "     ELSE NULL END AS outcome",
    " FROM research_responses r",
    " JOIN research_invites i ON i.id=r.invite_id",
    " LEFT JOIN research_sample_units su ON su.id=i.sample_unit_id",
    " LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
    " LEFT JOIN research_response_design_context ctx ON ctx.response_id=r.id",
    " LEFT JOIN research_answers a ON a.response_id=r.id AND a.question_id=$5::uuid",
    " LEFT JOIN research_answers b ON b.response_id=r.id AND b.question_id=$6::uuid",
    " WHERE r.study_id=$1 AND r.instrument_id=$2",
    " AND r.withdrawn_at IS NULL AND r.status IN ('completed','in_progress')",
    " AND ($3::text='all' OR r.status=$3::text)",
    " AND i.fieldwork_phase=$4",
    " AND ($9::text='' OR COALESCE(fu.sector_code,ctx.sector_code)=$9)",
    " AND ($10::text='' OR COALESCE(fu.sampling_attributes->'matchedActivityCodes',ctx.matched_kad_codes,'[]'::jsonb) ? $10::text)",
    ")",
    "SELECT prefecture,postcode,segment,",
    " count(*) FILTER (WHERE has_a AND has_b)::integer AS answered,",
    " count(*) FILTER (WHERE has_a AND has_b AND outcome)::integer AS selected,",
    " count(*) FILTER (WHERE has_a AND NOT has_b)::integer AS only_a,",
    " count(*) FILTER (WHERE has_b AND NOT has_a)::integer AS only_b",
    " FROM labeled WHERE has_a OR has_b",
    " GROUP BY prefecture,postcode,segment ORDER BY prefecture,postcode,segment"
  ].join("\n"),[
    study.study_id,study.instrument_id,
    mode==="draft"?"in_progress":mode,phase,
    qa.id,qb.id,[...resolved.pair.av],[...resolved.pair.bv],sector,kad
  ]);
  const recordRows=records.rows.map(row=>({
    prefecture:resolveResearchAdministrativeGeography(row.postcode,row.prefecture).regionCode,
    segment:row.segment===null||row.segment===undefined?null:
      row.segment===true||row.segment==="true",
    answered:Number(row.answered??0), selected:Number(row.selected??0),
    aOnly:Number(row.only_a??0), bOnly:Number(row.only_b??0)
  }));
  const coverage=relationshipAnswerCoverage(recordRows);
  const exact=rawResearchAnswerAccess(principal);
  const agg=aggregateRelationship(recordRows);
  const filters:RelationshipFilters={
    mode,phase,sector,kad,region,view,compare,preset:resolved.preset,
    a:resolved.a,av:resolved.av,b:resolved.b,bv:resolved.bv
  };
  await recordAdminPersonalDataAccess(principal,{
    route:"/admin/research/surveys/"+encodeURIComponent(slug)+"/map/relations",
    resourceType:"research_geographic_relationships",resourceId:slug,
    purpose:"privacy_operations",
    dataClasses:["research_structured_answers","source_business_geography"],
    recordCount:agg.nationalSegment.answered+agg.nationalOther.answered,
    accessScope:"bulk"
  });
  return {
    title:text(study.title),capturedAt:new Date().toISOString(),filters,
    pair:resolved.pair,questions,sectors:sectorOptions,kads:kadOptions,
    regions:agg.regions.map(row=>safeRelationshipRegion(row,exact)),
    nationalSegment:safeRelationshipCounts(agg.nationalSegment,exact),
    nationalOther:safeRelationshipCounts(agg.nationalOther,exact),
    unknownGeography:agg.unknown>0,
    coverage:exact?coverage:null,regionalCoverage:exact?relationshipAnswerCoverageByRegion(recordRows):null,
    canViewExactSmallCells:exact,
    totalMatchedBase:exact || (agg.nationalSegment.answered>=15 && agg.nationalOther.answered>=15)
      ? coverage.paired:null
  };
}

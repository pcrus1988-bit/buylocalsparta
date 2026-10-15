import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { GREECE_REGIONS } from "./research-geographic-core";
import {
  RESEARCH_RELATIONSHIP_PRESETS, aggregateRelationship, safeRelationshipCounts, safeRelationshipRegion,
  type RelationshipPair, type SafeRelationshipRegion, type SafeRelationshipCounts
} from "./research-geographic-relations-core";

export type RelationshipChoice = Readonly<{ key:string; label:string }>;
export type RelationshipQuestion = Readonly<{
  code:string; label:string; type:"single"|"multi"|"scale"; options:readonly RelationshipChoice[];
}>;
export type RelationshipFilters = Readonly<{
  mode:"draft"|"completed"; phase:"main"|"pilot"; sector:string; kad:string; region:string;
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
}>;

const SLUG=/^[a-z0-9][a-z0-9-]{2,79}$/;
const text=(v:unknown)=>v==null?"":String(v);
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v?:string,limit=100)=>String(v??"").trim().slice(0,limit);
const pairs=(value:unknown):RelationshipChoice[]=>Array.isArray(value)
 ? value.flatMap(item=>Array.isArray(item)&&item.length>=2?[{key:String(item[0]),label:String(item[1])}]:[]):[];
const SECTOR_LABELS: Record<string,string>={
  fashion_footwear:"Ένδυση / υπόδηση",home_living:"Σπίτι / διακόσμηση",
  beauty_personal_care:"Ομορφιά / φροντίδα",diy_building:"Εργαλεία / οικοδομικά",
  other_non_food_retail:"Λοιπό λιανεμπόριο",sports_books_hobby:"Αθλητικά / βιβλία / χόμπι",
  automotive_trade:"Αυτοκίνητο",electronics:"Ηλεκτρονικά",flowers_pets:"Άνθη / κατοικίδια",
  jewellery_watches:"Κοσμήματα / ρολόγια",second_hand:"Μεταχειρισμένα"
};
function questionChoices(row:SqlRow):RelationshipChoice[]{
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
      "SELECT DISTINCT fu.sector_code AS code FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "WHERE r.study_id=$1 AND NULLIF(fu.sector_code,'') IS NOT NULL",
      "ORDER BY 1 LIMIT 40"
    ].join("\n"),[study.study_id]),
    pool.query<SqlRow>([
      "SELECT matched.code, count(*) AS n FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "CROSS JOIN LATERAL jsonb_array_elements_text(",
      " CASE WHEN jsonb_typeof(fu.sampling_attributes->'matchedActivityCodes')='array'",
      " THEN fu.sampling_attributes->'matchedActivityCodes' ELSE '[]'::jsonb END) AS matched(code)",
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
  const mode=input.mode==="completed"?"completed":"draft";
  const phase=input.phase==="pilot"?"pilot":"main";
  const qa=qr.rows.find(q=>q.code===resolved.a);
  const qb=qr.rows.find(q=>q.code===resolved.b);
  if(!qa||!qb)return undefined;

  // Both A and B must contain a substantive response; single-choice
  // "unknown" and empty multi-select are excluded from BOTH denominators.
  const records=await pool.query<SqlRow>([
    "WITH complete_pairs AS (",
    " SELECT COALESCE(fu.sampling_attributes->>'prefecture','') AS prefecture,",
    "   CASE WHEN jsonb_typeof(a.answer)='array' THEN a.answer ?| $7::text[]",
    "     ELSE a.answer #>> '{}' = ANY($7::text[]) END AS segment,",
    "   CASE WHEN jsonb_typeof(b.answer)='array' THEN b.answer ?| $8::text[]",
    "     ELSE b.answer #>> '{}' = ANY($8::text[]) END AS outcome",
    " FROM research_responses r",
    " JOIN research_invites i ON i.id=r.invite_id",
    " JOIN research_sample_units su ON su.id=i.sample_unit_id",
    " JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
    " JOIN research_answers a ON a.response_id=r.id AND a.question_id=$5::uuid",
    " JOIN research_answers b ON b.response_id=r.id AND b.question_id=$6::uuid",
    " WHERE r.study_id=$1 AND r.instrument_id=$2",
    " AND r.status=$3 AND r.withdrawn_at IS NULL AND i.fieldwork_phase=$4",
    " AND ($9::text='' OR fu.sector_code=$9)",
    " AND ($10::text='' OR COALESCE(fu.sampling_attributes->'matchedActivityCodes','[]'::jsonb) ? $10::text)",
    " AND jsonb_typeof(a.answer) IN ('array','string','number')",
    " AND jsonb_typeof(b.answer) IN ('array','string','number')",
    " AND a.answer <> '[]'::jsonb AND b.answer <> '[]'::jsonb",
    " AND (jsonb_typeof(a.answer)='array' OR a.answer #>> '{}' <> 'unknown')",
    " AND (jsonb_typeof(b.answer)='array' OR b.answer #>> '{}' <> 'unknown')",
    ")",
    "SELECT prefecture,segment,count(*)::integer answered,",
    " count(*) FILTER (WHERE outcome)::integer selected",
    "FROM complete_pairs GROUP BY prefecture,segment ORDER BY prefecture,segment"
  ].join("\n"),[
    study.study_id,study.instrument_id,mode==="completed"?"completed":"in_progress",phase,
    qa.id,qb.id,[...resolved.pair.av],[...resolved.pair.bv],sector,kad
  ]);
  const agg=aggregateRelationship(records.rows.map(row=>({
    prefecture:text(row.prefecture),segment:Boolean(row.segment),
    answered:Number(row.answered??0),selected:Number(row.selected??0)
  })));
  const filters:RelationshipFilters={
    mode,phase,sector,kad,region,preset:resolved.preset,
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
    regions:agg.regions.map(safeRelationshipRegion),
    nationalSegment:safeRelationshipCounts(agg.nationalSegment),
    nationalOther:safeRelationshipCounts(agg.nationalOther),
    unknownGeography:agg.unknown>0,
    totalMatchedBase:agg.nationalSegment.answered>=15 && agg.nationalOther.answered>=15
      ? agg.nationalSegment.answered+agg.nationalOther.answered:null
  };
}

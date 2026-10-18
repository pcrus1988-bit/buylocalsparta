import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { rawResearchAnswerAccess } from "./research-survey-response-admin";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type KadCoverageRow = Readonly<{
  sector:string; total:number; completed:number; inProgress:number;
  frozen:number; hasMatchedKad:number; hasAllCodes:number;
}>;
export type KadGroupRow = Readonly<{ code:string; respondents:number|null }>;
export type ResearchKadCoverageAudit = Readonly<{
  title:string; status:string; phase:string; capturedAt:string;
  total:number; completed:number; inProgress:number; withdrawnExcluded:number;
  currentFrameLinked:number; immutableContextFrozen:number;
  sectorPresent:number; matchedKadPresent:number; fullActivityCodesPresent:number;
  classificationVersions: readonly Readonly<{version:string;source:string;count:number}>[];
  sectors: readonly KadCoverageRow[];
  kadFourDigit: readonly KadGroupRow[];
  exactSmallCells:boolean;
}>;

const text=(x:unknown)=>x==null?"":String(x);
const num=(x:unknown)=>Number(x??0);

/**
 * Always pair existing invitation-frame joins with the immutable response
 * design context; after identity destruction, sample_unit_id is detached
 * and only context remains.  No contacts, names, full KAD combinations,
 * postcode, source record refs or individual response data reach the browser.
 */
export async function researchKadCoverageAudit(
  principal:SessionPrincipal,slug:string
):Promise<ResearchKadCoverageAudit|undefined>{
  assertAdminPermission(principal,"research.read");
  if(!productionDatabaseConfigured()||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug))return undefined;
  const pool=getAdminPostgresRuntime().sqlPool;
  const studies=await pool.query<SqlRow>(
    "SELECT id,title,status FROM research_studies WHERE slug=$1 LIMIT 1",[slug]);
  const study=studies.rows[0];if(!study)return undefined;
  const scoped=`
    WITH eligible AS (
      SELECT r.id,r.status,
        (fu.id IS NOT NULL) AS still_linked,
        (ctx.response_id IS NOT NULL) AS frozen,
        COALESCE(NULLIF(ctx.sector_code,''),NULLIF(fu.sector_code,''),'unknown') AS sector,
        COALESCE(ctx.matched_kad_codes,
          CASE WHEN jsonb_typeof(fu.sampling_attributes->'matchedActivityCodes')='array'
            THEN fu.sampling_attributes->'matchedActivityCodes' ELSE '[]'::jsonb END
        ) AS matched,
        COALESCE(ctx.source_activity_codes,
          CASE WHEN jsonb_typeof(fu.sampling_attributes->'activityCodes')='array'
            THEN fu.sampling_attributes->'activityCodes' ELSE '[]'::jsonb END
        ) AS activities,
        COALESCE(NULLIF(ctx.kad_classification_version,'unknown'),
          NULLIF(fu.sampling_attributes->>'classificationVersion',''),'unknown') AS version,
        COALESCE(NULLIF(ctx.kad_source_kind,'unknown'),
          NULLIF(fu.sampling_attributes->>'source',''),'unknown') AS source
      FROM research_responses r
      JOIN research_invites i ON i.id=r.invite_id
      LEFT JOIN research_sample_units su ON su.id=i.sample_unit_id
      LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id
      LEFT JOIN research_response_design_context ctx ON ctx.response_id=r.id
      WHERE r.study_id=$1 AND r.withdrawn_at IS NULL
    )`;
  const [totals,sectors,versions,kad]=await Promise.all([
    pool.query<SqlRow>(scoped+`
      SELECT count(*)::int total,
        count(*) FILTER(WHERE status='completed')::int completed,
        count(*) FILTER(WHERE status='in_progress')::int in_progress,
        count(*) FILTER(WHERE still_linked)::int linked,
        count(*) FILTER(WHERE frozen)::int frozen,
        count(*) FILTER(WHERE sector<>'unknown')::int sector,
        count(*) FILTER(WHERE jsonb_typeof(matched)='array' AND jsonb_array_length(matched)>0)::int matched,
        count(*) FILTER(WHERE jsonb_typeof(activities)='array' AND jsonb_array_length(activities)>0)::int activities
      FROM eligible`,[study.id]),
    pool.query<SqlRow>(scoped+`
      SELECT sector,count(*)::int total,
        count(*) FILTER(WHERE status='completed')::int completed,
        count(*) FILTER(WHERE status='in_progress')::int in_progress,
        count(*) FILTER(WHERE frozen)::int frozen,
        count(*) FILTER(WHERE jsonb_typeof(matched)='array' AND jsonb_array_length(matched)>0)::int matched,
        count(*) FILTER(WHERE jsonb_typeof(activities)='array' AND jsonb_array_length(activities)>0)::int activities
      FROM eligible GROUP BY sector ORDER BY total DESC,sector`,[study.id]),
    pool.query<SqlRow>(scoped+`
      SELECT version,source,count(*)::int n
      FROM eligible GROUP BY version,source ORDER BY n DESC,version,source`,[study.id]),
    pool.query<SqlRow>(scoped+`
      SELECT LEFT(k.code,4) AS code,count(DISTINCT e.id)::int n
      FROM eligible e
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(e.matched)='array' THEN e.matched ELSE '[]'::jsonb END
      ) k(code)
      WHERE k.code ~ '^[0-9]{8}$'
      GROUP BY LEFT(k.code,4) ORDER BY n DESC,code LIMIT 45`,[study.id])
  ]);
  const row=totals.rows[0]??{};
  const retired=await pool.query<SqlRow>(
    "SELECT count(*)::int n FROM research_responses WHERE study_id=$1 AND withdrawn_at IS NOT NULL",
    [study.id]);
  const exact=rawResearchAnswerAccess(principal);
  const toSectors=sectors.rows.map(x=>({
    sector:text(x.sector),total:num(x.total),completed:num(x.completed),
    inProgress:num(x.in_progress),frozen:num(x.frozen),
    hasMatchedKad:num(x.matched),hasAllCodes:num(x.activities)
  }));
  return {
    title:text(study.title),status:text(study.status),phase:"all",
    capturedAt:new Date().toISOString(),
    total:num(row.total),completed:num(row.completed),inProgress:num(row.in_progress),
    withdrawnExcluded:num(retired.rows[0]?.n),
    currentFrameLinked:num(row.linked),immutableContextFrozen:num(row.frozen),
    sectorPresent:num(row.sector),matchedKadPresent:num(row.matched),
    fullActivityCodesPresent:num(row.activities),
    classificationVersions:versions.rows.map(x=>({
      version:text(x.version),source:text(x.source),count:num(x.n)
    })),
    // Read-only users receive national coverage, not a partition whose small
    // sectors can be recovered by subtraction from the national total.
    sectors:exact?toSectors:[],
    kadFourDigit:exact?kad.rows.map(x=>({code:text(x.code),respondents:num(x.n)})):[],
    exactSmallCells:exact
  };
}

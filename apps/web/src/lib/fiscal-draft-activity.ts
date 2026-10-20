/**
 * M45: Read-only, production merchant draft activity summary.
 * Counts genuine saved, never-issued test records in the last 30 rolling days.
 * Does not infer income, taxable sales, legally valid VAT or issued invoices.
 */
import {fiscalPool} from "./fiscal-runtime";
import type {FiscalActor} from "./fiscal-auth";
import type {FiscalInboxFilters,FiscalInboxLane,FiscalInboxSource} from "./fiscal-draft-inbox";

type Lane=FiscalInboxLane;
type Source=FiscalInboxSource;
export type FiscalDraftActivityBucket=Readonly<{
 day:string;lane:Lane;source:Source;draft_count:string;
 known_amount_count:string;gross_minor:string;
}>;
export type FiscalDraftActivityGroup=Readonly<{
 key:string;count:bigint;knownAmountCount:bigint;grossMinor:bigint
}>;
export type FiscalDraftActivity=Readonly<{
 count:bigint;knownAmountCount:bigint;missingAmountCount:bigint;
 grossMinor:bigint;byLane:FiscalDraftActivityGroup[];
 bySource:FiscalDraftActivityGroup[];daily:FiscalDraftActivityGroup[];
}>;

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LANES=["b2c","pos","b2b","b2g"] as const;
const SOURCES=["console","external_api","marketplace"] as const;
const MAX_GROUPS=31*LANES.length*SOURCES.length;
const integer=(input:string):bigint=>{
 if(typeof input!=="string"||!/^(0|[1-9][0-9]{0,29})$/.test(input))
  throw Error("FISCAL_M45_INVALID_METRIC");
 return BigInt(input);
};
const empty=()=>({count:0n,knownAmountCount:0n,grossMinor:0n});
const aggregate=(map:Map<string,ReturnType<typeof empty>>,key:string,
 count:bigint,knownAmountCount:bigint,grossMinor:bigint)=>{
 const item=map.get(key)??empty();
 item.count+=count;
 item.knownAmountCount+=knownAmountCount;
 item.grossMinor+=grossMinor;
 map.set(key,item);
};
function groups(map:Map<string,ReturnType<typeof empty>>):FiscalDraftActivityGroup[]{
 return [...map.entries()].map(([key,fields])=>({key,...fields}))
  .sort((a,b)=>a.key.localeCompare(b.key));
}
export function summarizeFiscalDraftActivity(
 buckets:readonly FiscalDraftActivityBucket[]
):FiscalDraftActivity{
 if(!Array.isArray(buckets)||buckets.length>MAX_GROUPS)
  throw Error("FISCAL_M45_INVALID_BUCKET_SCOPE");
 const all=empty();
 const lane=new Map<string,ReturnType<typeof empty>>();
 const source=new Map<string,ReturnType<typeof empty>>();
 const daily=new Map<string,ReturnType<typeof empty>>();
 const unique=new Set<string>();
 for(const bucket of buckets){
  if(!bucket||!LANES.includes(bucket.lane)||!SOURCES.includes(bucket.source)||
   typeof bucket.day!=="string"||
   !/^\d{4}-\d{2}-\d{2}$/.test(bucket.day)||
   !Number.isFinite(Date.parse(bucket.day+"T00:00:00Z"))||
   new Date(bucket.day+"T00:00:00Z").toISOString().slice(0,10)!==bucket.day)
   throw Error("FISCAL_M45_INVALID_BUCKET");
  const key=[bucket.day,bucket.lane,bucket.source].join("|");
  if(unique.has(key))throw Error("FISCAL_M45_DUPLICATE_BUCKET");
  unique.add(key);
  const count=integer(bucket.draft_count);
  const known=integer(bucket.known_amount_count);
  const gross=integer(bucket.gross_minor);
  if(known>count||count===0n||known===0n&&gross!==0n)
   throw Error("FISCAL_M45_INVALID_BUCKET");
  all.count+=count;
  all.knownAmountCount+=known;
  all.grossMinor+=gross;
  aggregate(lane,bucket.lane,count,known,gross);
  aggregate(source,bucket.source,count,known,gross);
  aggregate(daily,bucket.day,count,known,gross);
 }
 return {
  ...all,missingAmountCount:all.count-all.knownAmountCount,
  byLane:groups(lane),bySource:groups(source),daily:groups(daily)
 };
}

/**
 * A single indexed, tenant-scoped aggregate. All 30-day merchant draft rows
 * are grouped inside Postgres; no raw document list or counterparty details
 * are returned. Known gross values are simulation-only (not booked revenue).
 */
export const FISCAL_M45_ACTIVITY_SQL=`
 WITH scoped AS (
  SELECT d.lane,d.source,
   (d.created_at AT TIME ZONE 'Europe/Athens')::date AS local_day,
   CASE WHEN d.payload->>'grossMinor' ~ '^[0-9]{1,13}$'
    THEN CASE WHEN (d.payload->>'grossMinor')::numeric<=1000000000000
      THEN (d.payload->>'grossMinor')::numeric ELSE NULL END
    ELSE NULL END AS safe_gross_minor
  FROM fiscal_document_intakes d
  JOIN fiscal_memberships m
   ON m.organization_id=d.organization_id AND m.user_id=$2
  JOIN fiscal_users u ON u.id=m.user_id AND u.disabled_at IS NULL
  WHERE d.organization_id=$1 AND d.status='draft'
   AND d.created_at>=now()-interval '30 days' AND d.created_at<=now()
   AND ($3::text IS NULL OR d.lane=$3)
   AND ($4::text IS NULL OR d.source=$4)
 )
 SELECT local_day::text AS day,lane,source,
  count(*)::text AS draft_count,
  count(safe_gross_minor)::text AS known_amount_count,
  COALESCE(sum(safe_gross_minor),0)::text AS gross_minor
 FROM scoped
 GROUP BY local_day,lane,source
 ORDER BY local_day,lane,source
`;
export async function getFiscalMerchantDraftActivity(
 actor:Pick<FiscalActor,"id">,organizationId:string,
 filters:Pick<FiscalInboxFilters,"lane"|"source">
):Promise<FiscalDraftActivity>{
 if(!UUID.test(actor.id)||!UUID.test(organizationId)||
  (filters.lane!==undefined&&!LANES.includes(filters.lane))||
  (filters.source!==undefined&&!SOURCES.includes(filters.source)))
  return summarizeFiscalDraftActivity([]);
 const result=await fiscalPool().query<FiscalDraftActivityBucket>({
  text:FISCAL_M45_ACTIVITY_SQL,
  values:[organizationId,actor.id,filters.lane??null,filters.source??null],
  query_timeout:5000
 });
 return summarizeFiscalDraftActivity(result.rows);
}
export function formatFiscalDraftMinorEuro(minor:bigint):string{
 if(minor<0n)throw Error("FISCAL_M45_NEGATIVE_AMOUNT");
 const whole=minor/100n;
 const cents=(minor%100n).toString().padStart(2,"0");
 return new Intl.NumberFormat("el-GR").format(whole)+","+cents+" €";
}

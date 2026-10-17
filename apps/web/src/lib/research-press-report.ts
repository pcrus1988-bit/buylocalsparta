import type {SessionPrincipal} from "@buy-local-sparta/core";
import {assertAdminPermission} from "./admin-runtime";
import {getProductionPostgresRuntime} from "./postgres-runtime";
import {
  pressDeliveryOutcome, type PressEventType, type PressDeliveryOutcome
} from "./research-press-provider-events";

const db=()=>getProductionPostgresRuntime().sqlPool;
export type PressCampaignMeta={
  id:string;title:string;status:string;created_at:Date|string;
  prepared_at:Date|string|null;completed_at:Date|string|null;total:number;
};
export type PressReportRow={
  release_id:string;recipient:string;language:"el"|"en";status:string;
  sent_at:Date|string|null;error_message:string|null;ses_message_id:string|null;
  event_types:PressEventType[];last_event_at:Date|string|null;
};
export type PressCampaignSummary=PressCampaignMeta & {
  accepted:number;delivered:number;bounced:number;complained:number;rejected:number;
  delayed:number;awaiting:number;pending:number;suppressed:number;held:number;failed:number;
  greek:number;english:number;lastEventAt:string|null;
};
export type PressReport={
  campaigns:PressCampaignSummary[]; current:PressCampaignSummary|null;
  rows:Array<PressReportRow&{outcome:PressDeliveryOutcome}>;
  trackingConfigured:boolean;
};
const emptyCounts=()=>({
  accepted:0,delivered:0,bounced:0,complained:0,rejected:0,
  delayed:0,awaiting:0,pending:0,suppressed:0,held:0,failed:0,greek:0,english:0
});
function isoDate(date:Date|string|null):string|null{
  if(!date)return null;
  const v=new Date(date);return Number.isFinite(v.getTime())?v.toISOString():null;
}
export async function pressCampaignReport(principal:SessionPrincipal,selectedId?:string):Promise<PressReport>{
  assertAdminPermission(principal,"research.publish.manage");
  const campaigns=(await db().query<PressCampaignMeta>(`
    SELECT id,title,status,created_at,prepared_at,completed_at,cardinality(recipients)::int AS total
    FROM public.research_press_releases
    ORDER BY created_at DESC LIMIT 50`)).rows;
  // Query the durable event history independently of SES acceptance; later/earlier
  // arrival order must not overwrite bounced/complained state with delivered.
  const summaries=(await db().query<{
    release_id:string;recipient:string;language:"el"|"en";status:string;
    event_types:PressEventType[];last_event_at:Date|string|null;
  }>(`WITH campaigns AS (
    SELECT id FROM public.research_press_releases ORDER BY created_at DESC LIMIT 50
  )
  SELECT d.release_id,d.recipient,d.language,d.status,
    COALESCE(array_remove(array_agg(DISTINCT e.event_type),NULL),'{}'::text[]) AS event_types,
    MAX(e.event_at) AS last_event_at
  FROM public.research_press_deliveries d
  JOIN campaigns c ON c.id=d.release_id
  LEFT JOIN public.research_press_delivery_events e
    ON e.release_id=d.release_id AND e.recipient=d.recipient
  GROUP BY d.release_id,d.recipient,d.language,d.status`)).rows;
  const byCampaign=new Map<string,PressCampaignSummary>();
  for(const item of campaigns)byCampaign.set(item.id,{...item,...emptyCounts(),lastEventAt:null});
  for(const row of summaries){
    const summary=byCampaign.get(row.release_id);if(!summary)continue;
    if(row.language==="el")summary.greek++;else summary.english++;
    if(row.status==="sent")summary.accepted++;
    const state=pressDeliveryOutcome(row.status,new Set(row.event_types));
    if(state==="delivered")summary.delivered++;
    else if(state==="bounced")summary.bounced++;
    else if(state==="complained")summary.complained++;
    else if(state==="rejected")summary.rejected++;
    else if(state==="delivery_delayed")summary.delayed++;
    else if(state==="accepted_unconfirmed")summary.awaiting++;
    else if(state==="pending")summary.pending++;
    else if(state==="suppressed")summary.suppressed++;
    else if(state==="held")summary.held++;
    else if(state==="failed")summary.failed++;
    const last=isoDate(row.last_event_at);
    if(last && (!summary.lastEventAt || last>summary.lastEventAt))summary.lastEventAt=last;
  }
  const summariesList=campaigns.map(c=>byCampaign.get(c.id)!);
  const current=selectedId?byCampaign.get(selectedId)||null:null;
  const detail=selectedId && current ? (await db().query<PressReportRow>(`
    SELECT d.release_id,d.recipient,d.language,d.status,d.sent_at,d.error_message,d.ses_message_id,
      COALESCE(array_remove(array_agg(DISTINCT e.event_type),NULL),'{}'::text[]) AS event_types,
      MAX(e.event_at) AS last_event_at
    FROM public.research_press_deliveries d
    LEFT JOIN public.research_press_delivery_events e
      ON e.release_id=d.release_id AND e.recipient=d.recipient
    WHERE d.release_id=$1
    GROUP BY d.release_id,d.recipient,d.language,d.status,d.sent_at,d.error_message,d.ses_message_id
    ORDER BY d.recipient LIMIT 500`,[selectedId])).rows : [];
  return {campaigns:summariesList,current,
    rows:detail.map(row=>({...row,outcome:pressDeliveryOutcome(row.status,new Set(row.event_types))})),
    trackingConfigured:Boolean(process.env.BLS_PRESS_SNS_TOPIC_ARN?.trim()&&process.env.BLS_PRESS_SES_CONFIGURATION_SET?.trim())
  };
}

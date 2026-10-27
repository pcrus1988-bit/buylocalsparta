import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";

const db=()=>getAdminPostgresRuntime().nativePool;
export type MarketingBrief={
 id:string;title:string;objective:string;channel:string;region:string;target_sector:string;
 proposed_budget_cents:string;starts_on:string|null;ends_on:string|null;status:string;
 created_at:Date;updated_at:Date
};
export type MarketingBriefInput={
 title:string;objective:string;channel:string;region:string;targetSector:string;
 proposedBudgetCents:number;startsOn:string|null;endsOn:string|null
};
export const MARKETING_CHANNELS=["social","search","marketplace","local_media","print","event"] as const;
export function validateMarketingBrief(x:MarketingBriefInput):boolean {
 return x.title.trim().length>=8&&x.title.trim().length<=140&&
 x.objective.trim().length>=30&&x.objective.trim().length<=2000&&
 MARKETING_CHANNELS.some(channel=>channel===x.channel)&&
 x.region.trim().length>=2&&x.region.trim().length<=120&&
 x.targetSector.trim().length>=2&&x.targetSector.trim().length<=120&&
 Number.isSafeInteger(x.proposedBudgetCents)&&x.proposedBudgetCents>=0&&x.proposedBudgetCents<=100000000&&
 (!x.startsOn||/^\d{4}-\d{2}-\d{2}$/.test(x.startsOn))&&
 (!x.endsOn||/^\d{4}-\d{2}-\d{2}$/.test(x.endsOn))&&
 (!x.startsOn||!x.endsOn||x.startsOn<=x.endsOn);
}
export type MaziMarketingAdminSnapshot={
 briefs:MarketingBrief[];membersInterested:number;profilesTotal:number;channelCounts:{channel:string;count:number}[];
};
export async function readMaziMarketingAdmin(principal:SessionPrincipal):Promise<MaziMarketingAdminSnapshot> {
 await marketplaceMaziActor(principal);
 const [briefs,memberInterest,channels]=await Promise.all([
  db().query<MarketingBrief>(`select id::text,title,objective,channel,region,target_sector,proposed_budget_cents::text,
    starts_on::text,ends_on::text,status,created_at,updated_at
    from public.mazi_marketing_briefs order by created_at desc limit 80`),
  db().query<{profiles_total:string;members_interested:string}>(`select count(*)::text as profiles_total,
    count(*) filter (where wants_collective_campaigns)::text as members_interested
    from public.mazi_marketing_preferences`),
  db().query<{channel:string;count:string}>(`select channel,count(*)::text as count from
    public.mazi_marketing_preferences p cross join lateral unnest(p.channels) as channel
    where p.wants_collective_campaigns group by channel order by count(*) desc`)
 ]);
 return {
  briefs:briefs.rows,
  profilesTotal:Number(memberInterest.rows[0]?.profiles_total||0),
  membersInterested:Number(memberInterest.rows[0]?.members_interested||0),
  channelCounts:channels.rows.map(r=>({channel:r.channel,count:Number(r.count)}))
 };
}
export async function createMaziMarketingBrief(principal:SessionPrincipal,input:MarketingBriefInput):Promise<void> {
 if(!validateMarketingBrief(input))throw new Error("MAZI_MARKETING_INPUT_INVALID");
 const actor=await marketplaceMaziActor(principal);
 await db().query(`insert into public.mazi_marketing_briefs
  (title,objective,channel,region,target_sector,proposed_budget_cents,starts_on,ends_on,created_by,updated_by)
  values($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9::uuid,$9::uuid)`,[
   input.title.trim(),input.objective.trim(),input.channel,input.region.trim(),
   input.targetSector.trim(),input.proposedBudgetCents,input.startsOn,input.endsOn,actor
  ]);
}
export async function transitionMaziMarketingBrief(
 principal:SessionPrincipal,id:string,status:"draft"|"review"|"archived"
):Promise<void>{
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error("MAZI_MARKETING_ID_INVALID");
 const actor=await marketplaceMaziActor(principal);
 const result=await db().query<{id:string}>(`update public.mazi_marketing_briefs
  set status=$2,updated_by=$3::uuid
  where id=$1::uuid and status<>'archived'
  and (status='draft' and $2 in ('review','archived')
    or status='review' and $2 in ('draft','archived'))
  returning id::text`,[id,status,actor]);
 if(result.rows.length!==1)throw new Error("MAZI_MARKETING_TRANSITION_DENIED");
}

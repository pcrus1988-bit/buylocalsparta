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
export type MarketingCandidate={user_id:string;business_name:string;gemi_number:string|null;channels:string[]};
export type MarketingCreativeInvite={id:string;brief_id:string;member_user_id:string;campaign_title:string;business_name:string;channel:string;creative_text:string;destination_url:string;status:string;created_at:Date;responded_at:Date|null};
export type MaziMarketingAdminSnapshot={
 briefs:MarketingBrief[];membersInterested:number;profilesTotal:number;channelCounts:{channel:string;count:number}[];
 candidates:MarketingCandidate[];invitations:MarketingCreativeInvite[];
};
export async function readMaziMarketingAdmin(principal:SessionPrincipal):Promise<MaziMarketingAdminSnapshot> {
 await marketplaceMaziActor(principal);
 const [briefs,memberInterest,channels,candidates,invitations]=await Promise.all([
  db().query<MarketingBrief>(`select id::text,title,objective,channel,region,target_sector,proposed_budget_cents::text,
    starts_on::text,ends_on::text,status,created_at,updated_at
    from public.mazi_marketing_briefs order by created_at desc limit 80`),
  db().query<{profiles_total:string;members_interested:string}>(`select count(*)::text as profiles_total,
    count(*) filter (where wants_collective_campaigns)::text as members_interested
    from public.mazi_marketing_preferences`),
  db().query<{channel:string;count:string}>(`select channel,count(*)::text as count from
    public.mazi_marketing_preferences p cross join lateral unnest(p.channels) as channel
    where p.wants_collective_campaigns group by channel order by count(*) desc`),
  db().query<MarketingCandidate>(`select m.user_id::text,a.business_name,m.gemi_number,p.channels
   from public.mazi_members m
   join public.mazi_membership_applications a on a.id=m.application_id
   join public.mazi_marketing_preferences p on p.member_user_id=m.user_id
   where m.status='verified' and m.identity_verified_at is not null
    and a.status='approved' and p.wants_collective_campaigns
   order by a.business_name,m.user_id limit 100`),
  db().query<MarketingCreativeInvite>(`select i.id::text,i.brief_id::text,i.member_user_id::text,
    i.campaign_title,a.business_name,i.channel,i.creative_text,i.destination_url,
    i.status,i.created_at,i.responded_at
    from public.mazi_marketing_creative_invitations i
    join public.mazi_members m on m.user_id=i.member_user_id
    join public.mazi_membership_applications a on a.id=m.application_id
    order by i.created_at desc limit 100`)
 ]);
 return {
  briefs:briefs.rows,
  profilesTotal:Number(memberInterest.rows[0]?.profiles_total||0),
  membersInterested:Number(memberInterest.rows[0]?.members_interested||0),
  channelCounts:channels.rows.map(r=>({channel:r.channel,count:Number(r.count)})),
  candidates:candidates.rows,invitations:invitations.rows
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

export type CreativeInvitationInput={briefId:string;memberUserId:string;creativeText:string;assetDescription:string;destinationUrl:string};
const uuid=(x:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export async function issueMaziCreativeInvitation(principal:SessionPrincipal,x:CreativeInvitationInput):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 if(!uuid(x.briefId)||!uuid(x.memberUserId)||x.creativeText.trim().length<20||x.creativeText.trim().length>1500||
 x.assetDescription.length>500)throw new Error("MAZI_CREATIVE_INPUT_INVALID");
 let uri:URL;
 try{uri=new URL(x.destinationUrl);}catch{throw new Error("MAZI_CREATIVE_DESTINATION_INVALID")}
 if(uri.protocol!=="https:"||!["kontamou.site","www.kontamou.site"].includes(uri.hostname)||uri.username||uri.password||uri.port)
  throw new Error("MAZI_CREATIVE_DESTINATION_INVALID");
 const result=await db().query<{id:string}>(`insert into public.mazi_marketing_creative_invitations
  (brief_id,member_user_id,campaign_title,channel,creative_text,asset_description,destination_url,invited_by)
  select b.id,m.user_id,b.title,b.channel,$3,$4,$5,$6::uuid
  from public.mazi_marketing_briefs b
  join public.mazi_members m on m.user_id=$2::uuid
  join public.mazi_membership_applications a on a.id=m.application_id
  join public.mazi_marketing_preferences p on p.member_user_id=m.user_id
  where b.id=$1::uuid and b.status='review' and m.status='verified'
   and m.identity_verified_at is not null and a.status='approved'
   and p.wants_collective_campaigns and (cardinality(p.channels)=0 or b.channel=any(p.channels))
  returning id::text`,[x.briefId,x.memberUserId,x.creativeText.trim(),x.assetDescription.trim(),uri.toString(),actor]);
 if(result.rowCount!==1)throw new Error("MAZI_CREATIVE_NO_MATCHING_INTEREST");
}
export async function revokeMaziCreativeInvitation(principal:SessionPrincipal,id:string):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 if(!uuid(id))throw new Error("MAZI_CREATIVE_INPUT_INVALID");
 const result=await db().query<{id:string}>(`update public.mazi_marketing_creative_invitations
  set status='revoked',last_actor_id=$2::uuid where id=$1::uuid
  and status in ('pending','approved') returning id::text`,[id,actor]);
 if(result.rowCount!==1)throw new Error("MAZI_CREATIVE_REVOKE_DENIED");
}

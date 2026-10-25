import type {SessionPrincipal} from "@buy-local-sparta/core";
import {getAdminPostgresRuntime} from "./postgres-runtime";
import {marketplaceMaziActor} from "./mazi-superadmin";

export type MaziCommunityReport={
 id:string;resource_type:"listing"|"thread"|"reply"|"chat";resource_id:string;
 reason:string;created_at:Date;status:"open"|"dismissed"|"hidden";
 subject:string;
};
const tables:Record<MaziCommunityReport["resource_type"],string>={
 listing:"public.mazi_marketplace_listings",
 thread:"public.mazi_forum_threads",
 reply:"public.mazi_forum_replies",
 chat:"public.mazi_chat_messages"
};
export async function maziCommunityReports(principal:SessionPrincipal):Promise<MaziCommunityReport[]>{
 await marketplaceMaziActor(principal);
 const result=await getAdminPostgresRuntime().nativePool.query<MaziCommunityReport>(`
  select r.id::text,r.resource_type,r.resource_id::text,r.reason,r.created_at,r.status,
   coalesce(l.title,t.title,left(reply.body,160),left(chat.body,160),'Μη διαθέσιμο περιεχόμενο') subject
  from public.mazi_community_reports r
  left join public.mazi_marketplace_listings l on r.resource_type='listing' and l.id=r.resource_id
  left join public.mazi_forum_threads t on r.resource_type='thread' and t.id=r.resource_id
  left join public.mazi_forum_replies reply on r.resource_type='reply' and reply.id=r.resource_id
  left join public.mazi_chat_messages chat on r.resource_type='chat' and chat.id=r.resource_id
  order by case when r.status='open' then 0 else 1 end, r.created_at desc limit 100
 `);
 return result.rows;
}
export async function maziModerateCommunity(principal:SessionPrincipal,input:{
 reportId:string;decision:"hide"|"dismiss";reason:string
}):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 const reason=input.reason.trim();
 if(!/^[0-9a-f-]{36}$/i.test(input.reportId)||
    !["hide","dismiss"].includes(input.decision)||
    reason.length<20||reason.length>1000)
  throw Error("MAZI_MODERATION_INPUT_INVALID");
 const client=await getAdminPostgresRuntime().nativePool.connect();
 try {
  await client.query("BEGIN");
  const item=await client.query<Pick<MaziCommunityReport,"id"|"resource_id"|"resource_type"|"status">>(
   "select id::text,resource_id::text,resource_type,status from public.mazi_community_reports where id=$1::uuid for update",
   [input.reportId]
  );
  const report=item.rows[0];
  if(!report||report.status!=="open")throw Error("MAZI_REPORT_ALREADY_REVIEWED");
  const table=tables[report.resource_type];
  if(!table)throw Error("MAZI_REPORT_TYPE_UNRECOGNIZED");
  if(input.decision==="hide"){
   // Table identifier derives ONLY from local code allowlist, not user input.
   const hidden=await client.query(
    `update ${table} set hidden_at=coalesce(hidden_at,now()), hidden_by=coalesce(hidden_by,$2::uuid) where id=$1::uuid`,
    [report.resource_id,actor]
   );
   if(hidden.rowCount!==1)throw Error("MAZI_REPORT_RESOURCE_MISSING");
  }
  const updated=await client.query(
   `update public.mazi_community_reports set status=$2,reviewed_at=now(),reviewed_by=$3::uuid,review_reason=$4
    where id=$1::uuid and status='open'`,
   [report.id,input.decision==="hide"?"hidden":"dismissed",actor,reason]
  );
  if(updated.rowCount!==1)throw Error("MAZI_REPORT_DECISION_NOT_SAVED");
  await client.query(
   `insert into public.mazi_audit_events(actor_user_id,entity_type,entity_id,action,evidence)
    values($1::uuid,'community_report',$2::uuid,$3,jsonb_build_object(
     'resource_type',$4::text,'resource_id',$5::text,'reason',$6::text))`,
   [actor,report.id,input.decision==="hide"?"content_hidden":"report_dismissed",
    report.resource_type,report.resource_id,reason]
  );
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK");throw error;}
 finally{client.release();}
}

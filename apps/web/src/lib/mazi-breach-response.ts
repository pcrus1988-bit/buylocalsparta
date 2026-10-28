import {randomUUID} from "node:crypto";
import type {SessionPrincipal} from "@buy-local-sparta/core";
import {marketplaceMaziActor} from "./mazi-superadmin";
import {getAdminPostgresRuntime} from "./postgres-runtime";

/** Actual breach assessment is a human/controller decision. This is only an evidence register.
 * Never store victims, email addresses, secrets, access tokens, or raw incident logs here.
 */
export const MAZI_BREACH_RISKS=["not_personal_data","unlikely_risk","risk","high_risk"] as const;
export const MAZI_SUBJECT_EXCEPTIONS=[
 "effective_protection","subsequent_measures","disproportionate_effort"
] as const;
export const MAZI_BREACH_ACTIONS=[
 "assessed","authority_notified","subjects_notified","subjects_exception","closed","reopened"
] as const;
type Risk=(typeof MAZI_BREACH_RISKS)[number]|"pending";
export type MaziBreachCase={
 id:string;case_ref:string;aware_at:Date;source_reference:string;risk_assessment:Risk;
 case_status:"open"|"closed";authority_notified_at:Date|null;subjects_notified_at:Date|null;
 subjects_exception:string|null;deadline_at:Date;created_at:Date
};
export type MaziBreachEvent={
 case_id:string;event_kind:string;event_ref:string;effective_at:Date|null;
 risk_assessment:string|null;subjects_exception:string|null;late_reason_ref:string|null;
 recorded_at:Date
};
export type MaziBreachStats={
 total:number;open:number;pending_assessment:number;
 reportable_unnotified:number;reportable_overdue:number;high_risk_subject_action_pending:number;
};
const pool=()=>getAdminPostgresRuntime().nativePool;
const fail=(test:boolean)=>{if(!test)throw Error("MAZI_BREACH_CASE_INVALID");};
const evidence=(s:string)=>s.length>=12 && s.length<=180 &&
 /^[A-Za-z0-9_./:#-]+$/.test(s);
const validId=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
/** ISO8601 instant with explicit timezone prevents silent Athens/DST interpretation bugs. */
export function parseBreachInstant(raw:string):Date|null{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(raw))return null;
 const d=new Date(raw);
 return Number.isFinite(d.getTime())?d:null;
}
const inPast=(d:Date)=>d.getTime()<=Date.now()+60000;
const allowed=(s:string,opts:readonly string[])=>opts.includes(s);

export async function readMaziBreachRegister(principal:SessionPrincipal):Promise<{
 cases:MaziBreachCase[];events:MaziBreachEvent[];stats:MaziBreachStats
}>{
 await marketplaceMaziActor(principal);
 const [cases,events,stats]=await Promise.all([
  pool().query<MaziBreachCase>(`SELECT id::text,case_ref,aware_at,source_reference,risk_assessment,case_status,
   authority_notified_at,subjects_notified_at,subjects_exception,aware_at+interval '72 hours' AS deadline_at,
   created_at FROM public.mazi_breach_cases
   ORDER BY CASE WHEN case_status='open' THEN 0 ELSE 1 END, aware_at ASC LIMIT 150`),
  pool().query<MaziBreachEvent>(`SELECT case_id::text,event_kind,evidence_ref AS event_ref,effective_at,
   risk_assessment,subjects_exception,late_reason_ref,recorded_at
   FROM public.mazi_breach_case_events ORDER BY recorded_at DESC,id DESC LIMIT 400`),
  pool().query<MaziBreachStats>(`SELECT
   count(*)::int AS total,
   count(*) FILTER(WHERE case_status='open')::int AS open,
   count(*) FILTER(WHERE case_status='open' AND risk_assessment='pending')::int AS pending_assessment,
   count(*) FILTER(WHERE case_status='open' AND risk_assessment IN ('risk','high_risk')
    AND authority_notified_at IS NULL)::int AS reportable_unnotified,
   count(*) FILTER(WHERE case_status='open' AND risk_assessment IN ('risk','high_risk')
    AND authority_notified_at IS NULL AND aware_at+interval '72 hours'<now())::int AS reportable_overdue,
   count(*) FILTER(WHERE case_status='open' AND risk_assessment='high_risk'
    AND subjects_notified_at IS NULL AND subjects_exception IS NULL)::int AS high_risk_subject_action_pending
   FROM public.mazi_breach_cases`)
 ]);
 if(!stats.rows[0])throw Error("MAZI_BREACH_REGISTER_UNAVAILABLE");
 return {cases:cases.rows,events:events.rows,stats:stats.rows[0]};
}
export async function createMaziBreachCase(principal:SessionPrincipal,input:{
 awareAt:string;reference:string
}):Promise<string>{
 const actor=await marketplaceMaziActor(principal);
 const aware=parseBreachInstant(input.awareAt);
 fail(Boolean(aware)&&inPast(aware!));
 fail(evidence(input.reference));
 const id=randomUUID(),ref="MAZI-BREACH-"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 const client=await pool().connect();
 try{
  await client.query("BEGIN");
  await client.query(`INSERT INTO public.mazi_breach_cases
   (id,case_ref,aware_at,source_reference,created_by) VALUES($1::uuid,$2,$3::timestamptz,$4,$5::uuid)`,
   [id,ref,aware!.toISOString(),input.reference,actor]);
  await client.query(`INSERT INTO public.mazi_breach_case_events
   (case_id,event_kind,evidence_ref,effective_at,actor_user_id)
   VALUES($1::uuid,'recorded',$2,$3::timestamptz,$4::uuid)`,
   [id,input.reference,aware!.toISOString(),actor]);
  await client.query("COMMIT");
  return ref;
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
export async function transitionMaziBreachCase(principal:SessionPrincipal,input:{
 id:string;action:string;reference:string;risk?:string;effectiveAt?:string;
 exception?:string;lateReasonRef?:string
}):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 fail(validId(input.id)&&allowed(input.action,MAZI_BREACH_ACTIONS));
 fail(evidence(input.reference));
 const client=await pool().connect();
 try{
  await client.query("BEGIN");
  const locked=await client.query<MaziBreachCase>(`SELECT id::text,aware_at,risk_assessment,case_status,
    authority_notified_at,subjects_notified_at,subjects_exception
    FROM public.mazi_breach_cases WHERE id=$1::uuid FOR UPDATE`,[input.id]);
  const row=locked.rows[0];fail(Boolean(row));
  let change="",effective:Date|null=null;
  let risk:string|null=null,exception:string|null=null,lateReason:string|null=null;
  if(input.action==="assessed"){
   fail(row.case_status==="open"&&allowed(input.risk??"",MAZI_BREACH_RISKS));
   risk=input.risk!;
   change="risk_assessment=$2";
  }else if(input.action==="authority_notified"){
   fail(row.case_status==="open"&&["risk","high_risk"].includes(row.risk_assessment)
    &&!row.authority_notified_at);
   effective=parseBreachInstant(input.effectiveAt??"");
   fail(Boolean(effective)&&inPast(effective!)&&effective!.getTime()>=new Date(row.aware_at).getTime());
   lateReason=input.lateReasonRef?.trim()||null;
   if(effective!.getTime()>new Date(row.aware_at).getTime()+72*60*60*1000)
    fail(Boolean(lateReason)&&evidence(lateReason!));
   else fail(!lateReason);
   change="authority_notified_at=$2::timestamptz";
  }else if(input.action==="subjects_notified"){
   fail(row.case_status==="open"&&row.risk_assessment==="high_risk"&&
    !row.subjects_notified_at&&!row.subjects_exception);
   effective=parseBreachInstant(input.effectiveAt??"");
   fail(Boolean(effective)&&inPast(effective!)&&effective!.getTime()>=new Date(row.aware_at).getTime());
   change="subjects_notified_at=$2::timestamptz";
  }else if(input.action==="subjects_exception"){
   fail(row.case_status==="open"&&row.risk_assessment==="high_risk"&&
    !row.subjects_notified_at&&!row.subjects_exception);
   fail(allowed(input.exception??"",MAZI_SUBJECT_EXCEPTIONS));
   exception=input.exception!;
   change="subjects_exception=$2";
  }else if(input.action==="closed"){
   fail(row.case_status==="open"&&row.risk_assessment!=="pending"&&
    (!["risk","high_risk"].includes(row.risk_assessment)||!!row.authority_notified_at)&&
    (row.risk_assessment!=="high_risk"||!!row.subjects_notified_at||!!row.subjects_exception));
   change="case_status='closed'";
  }else{
   fail(row.case_status==="closed");
   change="case_status='open'";
  }
  const value=risk??exception??(effective?effective.toISOString():null);
  const args=value===null?[input.id]:[input.id,value];
  await client.query(`UPDATE public.mazi_breach_cases SET ${change},updated_at=now()
   WHERE id=$1::uuid`,args);
  await client.query(`INSERT INTO public.mazi_breach_case_events
   (case_id,event_kind,evidence_ref,effective_at,risk_assessment,subjects_exception,late_reason_ref,actor_user_id)
   VALUES($1::uuid,$2,$3,$4::timestamptz,$5,$6,$7,$8::uuid)`,[
   input.id,input.action,input.reference,effective?.toISOString()??null,risk,exception,lateReason,actor
  ]);
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}

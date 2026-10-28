import {randomUUID} from "node:crypto";
import type {SessionPrincipal} from "@buy-local-sparta/core";
import {marketplaceMaziActor} from "./mazi-superadmin";
import {getAdminPostgresRuntime} from "./postgres-runtime";

/** Private, minimal GDPR rights-case metadata. No email, identity papers or message text is stored. */
export const MAZI_RIGHTS_KINDS=[
 "access","rectification","erasure","restriction","portability","objection","consent_withdrawal","other"
] as const;
export type MaziRightsKind=(typeof MAZI_RIGHTS_KINDS)[number];
export type MaziPrivacyAction="identity_verified"|"identity_unverifiable"|"extension_notified"|
 "response_sent"|"legal_hold_placed"|"legal_hold_released"|"reopened";
export type MaziRightsCase={
 id:string;case_ref:string;request_kind:MaziRightsKind;received_on:string;
 identity_status:"pending"|"verified"|"cannot_verify";case_status:"open"|"responded";
 extension_notified_on:string|null;extension_reason:string|null;
 response_sent_on:string|null;response_outcome:string|null;
 legal_hold_active:boolean;due_on:string;created_at:Date;
};
export type MaziRightsEvent={
 request_id:string;event_kind:string;evidence_ref:string;recorded_at:Date;
};
export type MaziRightsStats={total:number;open:number;overdue:number;extended_open:number;legal_holds:number};
const pool=()=>getAdminPostgresRuntime().nativePool;
const validDate=(raw:string)=>/^\d{4}-\d{2}-\d{2}$/.test(raw) &&
 !Number.isNaN(Date.parse(raw+"T00:00:00.000Z")) &&
 new Date(raw+"T00:00:00.000Z").toISOString().slice(0,10)===raw;
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const validEvidence=(v:string)=>v.length>=12&&v.length<=180&&/^[A-Za-z0-9_./:#-]+$/.test(v);
const ensure=(ok:boolean):void=>{if(!ok)throw Error("MAZI_PRIVACY_CASE_INVALID");};

export async function readMaziPrivacyRequests(principal:SessionPrincipal):Promise<{cases:MaziRightsCase[];events:MaziRightsEvent[];stats:MaziRightsStats}>{
 await marketplaceMaziActor(principal);
 const cases=await pool().query<MaziRightsCase>(`
  SELECT id::text,case_ref,request_kind,received_on::text,identity_status,case_status,
   extension_notified_on::text,extension_reason,response_sent_on::text,response_outcome,
   legal_hold_active,created_at,
   (received_on + CASE WHEN extension_notified_on IS NULL THEN interval '1 month'
    ELSE interval '3 months' END)::date::text AS due_on
  FROM public.mazi_privacy_requests ORDER BY
   CASE WHEN case_status='open' THEN 0 ELSE 1 END,received_on ASC,created_at DESC
  LIMIT 150`);
 const events=await pool().query<MaziRightsEvent>(`
  SELECT request_id::text,event_kind,evidence_ref,recorded_at
  FROM public.mazi_privacy_request_events ORDER BY recorded_at DESC,id DESC LIMIT 300`);
 const summary=await pool().query<MaziRightsStats>(`
   SELECT count(*)::int AS total,
    count(*) FILTER (WHERE case_status='open')::int AS open,
    count(*) FILTER (WHERE case_status='open' AND
      (received_on + CASE WHEN extension_notified_on IS NULL THEN interval '1 month'
       ELSE interval '3 months' END)::date < (now() AT TIME ZONE 'Europe/Athens')::date)::int AS overdue,
    count(*) FILTER (WHERE case_status='open' AND extension_notified_on IS NOT NULL)::int AS extended_open,
    count(*) FILTER (WHERE legal_hold_active)::int AS legal_holds
   FROM public.mazi_privacy_requests`);
 if(!summary.rows[0])throw Error("MAZI_PRIVACY_REGISTER_UNAVAILABLE");
 return {cases:cases.rows,events:events.rows,stats:summary.rows[0]};
}

export async function createMaziPrivacyRequest(principal:SessionPrincipal,input:{
 requestKind:string;receivedOn:string;evidenceRef:string
}):Promise<string>{
 const actor=await marketplaceMaziActor(principal);
 ensure((MAZI_RIGHTS_KIN as readonly string[]).includes(input.requestKind));
 ensure(validDate(input.receivedOn)&&input.receivedOn<=today());
 ensure(validEvidence(input.evidenceRef));
 const id=randomUUID();
 const ref="MAZI-DSAR-"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 const client=await pool().connect();
 try{
  await client.query("BEGIN");
  await client.query(`INSERT INTO public.mazi_privacy_requests
   (id,case_ref,request_kind,received_on,created_by) VALUES($1::uuid,$2,$3,$4::date,$5::uuid)`,
   [id,ref,input.requestKind,input.receivedOn,actor]);
  await client.query(`INSERT INTO public.mazi_privacy_request_events
   (request_id,event_kind,evidence_ref,actor_user_id) VALUES($1::uuid,'received',$2,$3::uuid)`,
   [id,input.evidenceRef,actor]);
  await client.query("COMMIT");
  return ref;
 }catch(err){await client.query("ROLLBACK");throw err;}finally{client.release();}
}

export async function transitionMaziPrivacyRequest(principal:SessionPrincipal,input:{
 id:string;action:string;evidenceRef:string;eventOn?:string;reason?:string;outcome?:string
}):Promise<void>{
 const actor=await marketplaceMaziActor(principal);
 ensure(/^[a-f0-9-]{36}$/i.test(input.id));
 ensure(validEvidence(input.evidenceRef));
 ensure(["identity_verified","identity_unverifiable","extension_notified","response_sent",
 "legal_hold_placed","legal_hold_released","reopened"].includes(input.action));
 const client=await pool().connect();
 try{
  await client.query("BEGIN");
  const result=await client.query<MaziRightsCase & {original_due_on:string}>(`
   SELECT id::text,identity_status,case_status,legal_hold_active,
    received_on::text,extension_notified_on::text,extension_reason,
    (received_on + interval '1 month')::date::text AS original_due_on
    FROM public.mazi_privacy_requests WHERE id=$1::uuid FOR UPDATE`,[input.id]);
  const record=result.rows[0];
  ensure(Boolean(record));
  let changes="";
  const args:unknown[]=[input.id];
  if(input.action==="identity_verified"){
   ensure(record.case_status==="open"&&record.identity_status!=="verified");
   changes="identity_status='verified'";
  }else if(input.action==="identity_unverifiable"){
   ensure(record.case_status==="open"&&record.identity_status!=="cannot_verify");
   changes="identity_status='cannot_verify'";
  }else if(input.action==="extension_notified"){
   const d=input.eventOn??"",reason=input.reason??"";
   ensure(record.case_status==="open"&&!record.extension_notified_on);
   ensure(validDate(d)&&d>=record.received_on&&d<=record.original_due_on&&d<=today());
   ensure(["complexity","number_of_requests"].includes(reason));
   args.push(d,reason);
   changes="extension_notified_on=$2::date,extension_reason=$3";
  }else if(input.action==="response_sent"){
   const d=input.eventOn??"",outcome=input.outcome??"";
   ensure(record.case_status==="open"&&validDate(d)&&d>=record.received_on&&d<=today());
   ensure(["fulfilled","partially_fulfilled","refused_with_reason","cannot_identify"].includes(outcome));
   ensure((outcome==="cannot_identify"&&record.identity_status==="cannot_verify")||
    (outcome!=="cannot_identify"&&record.identity_status==="verified"));
   args.push(d,outcome);
   changes="case_status='responded',response_sent_on=$2::date,response_outcome=$3";
  }else if(input.action==="legal_hold_placed"){
   ensure(!record.legal_hold_active);
   changes="legal_hold_active=true";
  }else if(input.action==="legal_hold_released"){
   ensure(record.legal_hold_active);
   changes="legal_hold_active=false";
  }else{
   ensure(record.case_status==="responded");
   changes="case_status='open',response_sent_on=NULL,response_outcome=NULL";
  }
  await client.query(`UPDATE public.mazi_privacy_requests SET ${changes},updated_at=now() WHERE id=$1::uuid`,args);
  await client.query(`INSERT INTO public.mazi_privacy_request_events
   (request_id,event_kind,evidence_ref,actor_user_id) VALUES($1::uuid,$2,$3,$4::uuid)`,
   [input.id,input.action,input.evidenceRef,actor]);
  await client.query("COMMIT");
 }catch(err){await client.query("ROLLBACK");throw err;}finally{client.release();}
}

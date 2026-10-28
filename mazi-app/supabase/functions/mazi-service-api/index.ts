// MAZI token service gateway. Anon GET catalogue only; all private operations verify JWT.
// Supabase roles anon/authenticated do not receive public-schema USAGE.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";

const BASE=Deno.env.get("SUPABASE_URL")||"";
const SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(BASE,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGIN="https://mazi.kontamou.site";
const ORDER_POLICY_VERSION="mazi-service-order-v1-2026-10-28";
const H={"content-type":"application/json;charset=utf-8",
 "access-control-allow-origin":ORIGIN,
 "access-control-allow-methods":"GET,POST,OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type",
 "vary":"Origin","cache-control":"no-store"};
type Dict=Record<string,unknown>;
const send=(body:Dict,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const issueCodes=new Set(["not_authorized","invoice_reference_required","invalid_billing_period","member_not_eligible","overlapping_period","invoice_reference_conflict","subscription_not_activated"]);
const requestCodes=new Set(["not_authenticated","invalid_request","member_not_eligible","allowance_inactive","unknown_service","insufficient_tokens","cannot_cancel","unknown_request","invalid_transition","reason_required","note_too_long","invalid_message","invalid_message_kind","invalid_message_state","invalid_delivery_url","delivery_summary_required","revision_window_closed","revision_limit_reached","already_accepted","not_delivered","service_conditions_not_accepted","idempotency_conflict","subscription_not_activated"]);
const friendly=(error:{message?:string}|null,allowed:Set<string>)=>{
 const message=String(error?.message||"");
 for(const code of allowed)if(message.includes(code))return code;
 return "service_unavailable";
};
async function eligible(id:string){
 const {data:member,error}=await admin.from("mazi_members")
  .select("user_id,status,identity_verified_at,application_id").eq("user_id",id).maybeSingle();
 if(error)throw error;
 if(!member||member.status!=="verified"||!member.identity_verified_at)return false;
 const {data:a,error:e}=await admin.from("mazi_membership_applications")
  .select("status").eq("id",member.application_id).maybeSingle();
 if(e)throw e;
 return a?.status==="approved";
}
async function isAdmin(id:string){
 const {data,error}=await admin.from("mazi_administrators").select("user_id").eq("user_id",id).maybeSingle();
 if(error)throw error;
 return Boolean(data);
}
async function catalogue(){
 const {data,error}=await admin.from("mazi_service_catalog")
 .select("id,title,category,description,deliverable,turnaround_business_days,revisions_included,tokens,is_active")
 .eq("is_active",true).order("category").order("tokens").limit(80);
 if(error)throw error;
 return data||[];
}
Deno.serve(async(req:Request)=>{
 try{
  const origin=req.headers.get("origin");
  if(origin&&origin!==ORIGIN)return send({ok:false,error:"origin_not_allowed"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
  const url=new URL(req.url);
  if(req.method==="GET"&&url.searchParams.get("operation")==="catalogue"){
   return send({ok:true,services:await catalogue()});
  }
  if(req.method!=="POST")return send({ok:false,error:"not_found"},404);
  const bearer=req.headers.get("authorization")||"";
  if(!/^Bearer\s+\S+$/.test(bearer))return send({ok:false,error:"not_authenticated"},401);
  const jwt=bearer.replace(/^Bearer\s+/,"");
  const {data:{user},error:authError}=await admin.auth.getUser(jwt);
  if(authError||!user)return send({ok:false,error:"not_authenticated"},401);
  const raw=await req.text();
  if(raw.length>5500)return send({ok:false,error:"invalid_request"},413);
  let body:Dict;
  try{const v:unknown=JSON.parse(raw);if(!v||typeof v!=="object"||Array.isArray(v))return send({ok:false,error:"invalid_request"},400);body=v as Dict;}
  catch{return send({ok:false,error:"invalid_request"},400);}
  const operation=str(body.operation);
  if(operation==="member_wallet"){
   if(!await eligible(user.id))return send({ok:false,error:"member_not_eligible"},403);
   const [services,periods,requests]=await Promise.all([
    catalogue(),
    admin.from("mazi_service_periods").select("id,starts_at,ends_at,allowance_tokens")
      .eq("member_user_id",user.id).order("starts_at",{ascending:false}).limit(14),
    admin.from("mazi_service_requests").select("id,service_title_snapshot,token_price,status,created_at,period_id,brief,admin_note,completed_at,revisions_included_snapshot")
      .eq("member_user_id",user.id).order("created_at",{ascending:false}).limit(100)
   ]);
   if(periods.error||requests.error)throw periods.error||requests.error;
   const ids=(requests.data||[]).map(r=>r.id);
   const messages=ids.length?await admin.from("mazi_service_messages")
    .select("id,request_id,author_user_id,kind,body,delivery_url,created_at")
    .in("request_id",ids).order("id",{ascending:true}).limit(1000):{data:[],error:null};
   if(messages.error)throw messages.error;
   const receipts=ids.length?await admin.from("mazi_service_order_acceptances")
    .select("request_id,policy_version,accepted_at,token_price_snapshot,deliverable_snapshot,turnaround_business_days_snapshot,revisions_included_snapshot")
    .in("request_id",ids).eq("member_user_id",user.id).limit(100):{data:[],error:null};
   if(receipts.error)throw receipts.error;
   return send({ok:true,services,periods:periods.data||[],requests:requests.data||[],messages:messages.data||[],acceptances:receipts.data||[]});
  }
  if(operation==="service_request"){
   if(!await eligible(user.id))return send({ok:false,error:"member_not_eligible"},403);
   const service=str(body.service_id),brief=str(body.brief),idempotency=str(body.idempotency_key);
   const terms=str(body.terms_version),accepted=body.terms_accepted===true;
   if(!accepted||terms!==ORDER_POLICY_VERSION)
    return send({ok:false,error:"service_conditions_not_accepted"},400);
   if(!/^[a-z0-9-]{3,64}$/.test(service)||brief.length<20||brief.length>3000||!uuid(idempotency))
    return send({ok:false,error:"invalid_request"},400);
   const {data,error}=await admin.rpc("mazi_services_internal_request_v2",
    {p_actor:user.id,p_service_id:service,p_brief:brief,p_idempotency_key:idempotency,
     p_terms_version:terms,p_terms_accepted:true});
   if(error)return send({ok:false,error:friendly(error,requestCodes)},409);
   return send({ok:true,request_id:data});
  }
  if(operation==="service_cancel"){
   const id=str(body.request_id);
   if(!uuid(id))return send({ok:false,error:"invalid_request"},400);
   const {error}=await admin.rpc("mazi_services_internal_cancel_request",{p_actor:user.id,p_request:id});
   if(error)return send({ok:false,error:friendly(error,requestCodes)},409);
   return send({ok:true});
  }
  if(operation==="service_message"){
   const id=str(body.request_id),kind=str(body.kind),message=str(body.message);
   const deliveryUrl=str(body.delivery_url);
   if(!uuid(id)||!["member_message","admin_message","delivery","revision_request","acceptance"].includes(kind)||
      message.length<10||message.length>3000||deliveryUrl.length>1200)
     return send({ok:false,error:"invalid_message"},400);
   if((kind==="admin_message"||kind==="delivery")&&!(await isAdmin(user.id)))
     return send({ok:false,error:"not_authorized"},403);
   if((kind==="member_message"||kind==="revision_request"||kind==="acceptance")&&!(await eligible(user.id)))
     return send({ok:false,error:"member_not_eligible"},403);
   const {data,error}=await admin.rpc("mazi_services_internal_message",{
    p_actor:user.id,p_request:id,p_kind:kind,p_body:message,p_delivery_url:deliveryUrl||null
   });
   if(error)return send({ok:false,error:friendly(error,requestCodes)},409);
   return send({ok:true,message_id:data});
  }
  if(!["admin_dashboard","admin_issue_period","admin_transition"].includes(operation))
    return send({ok:false,error:"unknown_operation"},400);
  if(!await isAdmin(user.id))return send({ok:false,error:"not_authorized"},403);
  if(operation==="admin_dashboard"){
   const [requests,periods,members]=await Promise.all([
    admin.from("mazi_service_requests").select("id,member_user_id,service_title_snapshot,token_price,status,brief,created_at,admin_note,completed_at,revisions_included_snapshot").order("created_at",{ascending:false}).limit(150),
    admin.from("mazi_service_periods").select("id,member_user_id,starts_at,ends_at,verified_invoice_ref,issued_at").order("issued_at",{ascending:false}).limit(30),
    admin.from("mazi_members").select("user_id,status,identity_verified_at").order("admitted_at",{ascending:false}).limit(50)
   ]);
   if(requests.error||periods.error||members.error)throw requests.error||periods.error||members.error;
   const ids=(requests.data||[]).map(r=>r.id);
   const [messages,release]=await Promise.all([
    ids.length?admin.from("mazi_service_messages")
      .select("id,request_id,author_user_id,kind,body,delivery_url,created_at")
      .in("request_id",ids).order("id",{ascending:true}).limit(1500):
      Promise.resolve({data:[],error:null}),
    admin.from("mazi_service_release_state").select("paid_enabled").eq("id",true).single()
   ]);
   if(messages.error||release.error)throw messages.error||release.error;
   const receipts=ids.length?await admin.from("mazi_service_order_acceptances")
     .select("request_id,policy_version,accepted_at,token_price_snapshot,deliverable_snapshot,turnaround_business_days_snapshot,revisions_included_snapshot")
     .in("request_id",ids).limit(150):{data:[],error:null};
   if(receipts.error)throw receipts.error;
   return send({ok:true,requests:requests.data||[],periods:periods.data||[],members:members.data||[],messages:messages.data||[],acceptances:receipts.data||[],paid_enabled:release.data?.paid_enabled===true});
  }
  if(operation==="admin_issue_period"){
   const id=str(body.member_user_id),start=str(body.starts_at),end=str(body.ends_at),invoice=str(body.invoice_reference);
   if(!uuid(id)||invoice.length<8||invoice.length>160||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||
    !/[Zz]|[+-]\d{2}:\d{2}$/.test(start)||!/[Zz]|[+-]\d{2}:\d{2}$/.test(end))
    return send({ok:false,error:"invalid_request"},400);
   const {data,error}=await admin.rpc("mazi_services_internal_issue_period",{
    p_actor:user.id,p_member:id,p_starts:start,p_ends:end,p_verified_invoice_ref:invoice
   });
   if(error)return send({ok:false,error:friendly(error,issueCodes)},409);
   return send({ok:true,period_id:data});
  }
  const id=str(body.request_id),status=str(body.status),note=str(body.note);
  if(!uuid(id)||!["accepted","rejected","in_progress","completed","cancelled"].includes(status)||note.length>2000)
   return send({ok:false,error:"invalid_request"},400);
  const {error}=await admin.rpc("mazi_services_internal_admin_transition",{
   p_actor:user.id,p_request:id,p_status:status,p_note:note
  });
  if(error)return send({ok:false,error:friendly(error,requestCodes)},409);
  return send({ok:true});
 }catch(error){
  console.error("mazi_service_api_unavailable",error instanceof Error?error.name:"unknown");
  return send({ok:false,error:"service_unavailable"},503);
 }
});

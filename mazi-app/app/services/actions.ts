"use server";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";

function go(notice:string):never {redirect("/services?notice="+encodeURIComponent(notice));}
async function current(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 return db;
}
export async function requestService(form:FormData){
 const db=await current();
 const service=String(form.get("service_id")||"");
 const brief=String(form.get("brief")||"").trim();
 const idempotency=String(form.get("idempotency_key")||"");
 if(!/^[a-z0-9-]{3,64}$/.test(service)||brief.length<20||brief.length>3000||
 !/^[0-9a-f-]{36}$/i.test(idempotency))go("invalid_request");
 const {error}=await db.rpc("mazi_services_request",{p_service_id:service,p_brief:brief,p_idempotency_key:idempotency});
 if(error)go(["insufficient_tokens","allowance_inactive","member_not_eligible","unknown_service"].find(x=>error.message.includes(x))||"request_failed");
 go("requested");
}
export async function cancelService(form:FormData){
 const db=await current();
 const id=String(form.get("request_id")||"");
 if(!/^[0-9a-f-]{36}$/i.test(id))go("invalid_request");
 const {error}=await db.rpc("mazi_services_cancel_request",{p_request:id});
 go(error?"cancel_failed":"cancelled");
}
export async function issueServicePeriod(form:FormData){
 const db=await current();
 const member=String(form.get("member_user_id")||"");
 const starts=String(form.get("starts_at")||"");
 const ends=String(form.get("ends_at")||"");
 const ref=String(form.get("invoice_reference")||"").trim();
 const {data:isAdmin,error:check}=await db.rpc("mazi_is_administrator");
 if(check||isAdmin!==true)redirect("/dashboard");
 if(!/^[0-9a-f-]{36}$/i.test(member)||ref.length<8||ref.length>160||
 !Number.isFinite(Date.parse(starts))||!Number.isFinite(Date.parse(ends))||
 !/[Zz]|[+-]\d{2}:\d{2}$/.test(starts)||!/[Zz]|[+-]\d{2}:\d{2}$/.test(ends))
 redirect("/admin/services?notice=invalid");
 const {error}=await db.rpc("mazi_services_issue_period",{
  p_member:member,p_starts:starts,p_ends:ends,p_verified_invoice_ref:ref
 });
 redirect("/admin/services?notice="+(error?"issue_failed":"period_issued"));
}
export async function transitionService(form:FormData){
 const db=await current();
 const {data:isAdmin,error:check}=await db.rpc("mazi_is_administrator");
 if(check||isAdmin!==true)redirect("/dashboard");
 const id=String(form.get("request_id")||"");
 const status=String(form.get("status")||"");
 const note=String(form.get("note")||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!["accepted","rejected","in_progress","completed","cancelled"].includes(status)||
 note.length>2000)redirect("/admin/services?notice=invalid");
 const {error}=await db.rpc("mazi_services_admin_transition",{p_request:id,p_status:status,p_note:note});
 redirect("/admin/services?notice="+(error?"transition_failed":"updated"));
}
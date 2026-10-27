"use server";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {maziServiceRequest} from "../../lib/mazi-services-api";

function go(notice:string):never {redirect("/services?notice="+encodeURIComponent(notice));}
async function current(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
}
export async function requestService(form:FormData){
 await current();
 const service=String(form.get("service_id")||"");
 const brief=String(form.get("brief")||"").trim();
 const idempotency=String(form.get("idempotency_key")||"");
 if(!/^[a-z0-9-]{3,64}$/.test(service)||brief.length<20||brief.length>3000||
 !/^[0-9a-f-]{36}$/i.test(idempotency))go("invalid_request");
 const outcome=await maziServiceRequest("service_request",{service_id:service,brief,idempotency_key:idempotency});
 if(!outcome.ok)go(["insufficient_tokens","allowance_inactive","member_not_eligible","unknown_service"].includes(outcome.error)?outcome.error:"request_failed");
 go("requested");
}
export async function cancelService(form:FormData){
 await current();
 const id=String(form.get("request_id")||"");
 if(!/^[0-9a-f-]{36}$/i.test(id))go("invalid_request");
 const outcome=await maziServiceRequest("service_cancel",{request_id:id});
 go(outcome.ok?"cancelled":"cancel_failed");
}
export async function issueServicePeriod(form:FormData){
 await current();
 const member=String(form.get("member_user_id")||"");
 const starts=String(form.get("starts_at")||"");
 const ends=String(form.get("ends_at")||"");
 const ref=String(form.get("invoice_reference")||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(member)||ref.length<8||ref.length>160||
 !Number.isFinite(Date.parse(starts))||!Number.isFinite(Date.parse(ends))||
 !/[Zz]|[+-]\d{2}:\d{2}$/.test(starts)||!/[Zz]|[+-]\d{2}:\d{2}$/.test(ends))
 redirect("/admin/services?notice=invalid");
 const outcome=await maziServiceRequest("admin_issue_period",{
  member_user_id:member,starts_at:starts,ends_at:ends,invoice_reference:ref
 });
 redirect("/admin/services?notice="+(outcome.ok?"period_issued":"issue_failed"));
}
export async function transitionService(form:FormData){
 await current();
 const id=String(form.get("request_id")||"");
 const status=String(form.get("status")||"");
 const note=String(form.get("note")||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||!["accepted","rejected","in_progress","completed","cancelled"].includes(status)||
 note.length>2000)redirect("/admin/services?notice=invalid");
 const outcome=await maziServiceRequest("admin_transition",{request_id:id,status,note});
 redirect("/admin/services?notice="+(outcome.ok?"updated":"transition_failed"));
}
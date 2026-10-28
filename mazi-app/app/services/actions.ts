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
 const termsVersion=String(form.get("terms_version")||"");
 const termsAccepted=form.get("terms_accepted")==="yes";
 if(!termsAccepted||termsVersion!=="mazi-service-order-v1-2026-10-28")go("service_conditions_not_accepted");
 if(!/^[a-z0-9-]{3,64}$/.test(service)||brief.length<20||brief.length>3000||
 !/^[0-9a-f-]{36}$/i.test(idempotency))go("invalid_request");
 const outcome=await maziServiceRequest("service_request",{service_id:service,brief,idempotency_key:idempotency,terms_version:termsVersion,terms_accepted:true});
 if(!outcome.ok)go(["insufficient_tokens","allowance_inactive","member_not_eligible","unknown_service","service_conditions_not_accepted","idempotency_conflict","subscription_not_activated"].includes(outcome.error)?outcome.error:"request_failed");
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
export async function sendServiceMessage(form:FormData){
 await current();
 const id=String(form.get("request_id")||"").trim();
 const kind=String(form.get("kind")||"").trim();
 const message=String(form.get("message")||"").trim();
 const deliveryUrl=String(form.get("delivery_url")||"").trim();
 const isAdmin=["admin_message","delivery"].includes(kind);
 const back=isAdmin?"/admin/services":"/services";
 const jump=(notice:string):never=>redirect(back+"?notice="+encodeURIComponent(notice));
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)||
    !["member_message","admin_message","delivery","revision_request","acceptance"].includes(kind)||
    message.length<10||message.length>3000||deliveryUrl.length>1200)jump("message_invalid");
 const outcome=await maziServiceRequest("service_message",{
  request_id:id,kind,message,delivery_url:deliveryUrl
 });
 if(!outcome.ok)jump(["revision_window_closed","revision_limit_reached","already_accepted","invalid_message_state","invalid_delivery_url","delivery_summary_required"].includes(outcome.error)?outcome.error:"message_failed");
 jump(kind==="delivery"?"delivered":kind==="revision_request"?"revision_sent":kind==="acceptance"?"accepted":"message_sent");
}

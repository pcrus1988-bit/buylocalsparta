"use server";
import {redirect} from "next/navigation";
import {createClient} from "../lib/supabase/server";
import {maziMemberRequest} from "../lib/mazi-api";
const value=(v:FormDataEntryValue|null)=>typeof v==="string"?v.trim():"";
function navigate(path:string,notice:string):never{redirect(path+"?notice="+encodeURIComponent(notice));}
async function save(operation:string,data:Record<string,unknown>,path:string){
 const db=await createClient();const {data:{user},error}=await db.auth.getUser();
 if(error||!user)redirect("/join");
 const result=await maziMemberRequest(operation,data);
 if(!result.ok)navigate(path,["rate_limited","not_verified","invalid_content","thread_closed"].includes(result.error)?result.error:"write_failed");
 navigate(path,"saved");
}
export async function createListing(form:FormData){
 await save("community_create_listing",{
  kind:value(form.get("kind")),category:value(form.get("category")),
  title:value(form.get("title")),description:value(form.get("description"))
 },"/marketplace");
}
export async function startInquiry(form:FormData){
 await save("community_start_inquiry",{
  listing_id:value(form.get("listing_id")),body:value(form.get("body"))
 },"/marketplace");
}
export async function replyInquiry(form:FormData){
 await save("community_reply_inquiry",{
  inquiry_id:value(form.get("inquiry_id")),body:value(form.get("body"))
 },"/inbox");
}
export async function closeListing(form:FormData){
 await save("community_close_listing",{id:value(form.get("id"))},"/marketplace");
}
export async function createThread(form:FormData){
 await save("community_create_thread",{
  category:value(form.get("category")),title:value(form.get("title")),body:value(form.get("body"))
 },"/forum");
}
export async function replyThread(form:FormData){
 await save("community_reply",{thread_id:value(form.get("thread_id")),body:value(form.get("body"))},"/forum");
}
export async function reportContent(form:FormData){
 const resource_type=value(form.get("resource_type")),resource_id=value(form.get("resource_id"));
 const returnPath=resource_type==="listing"?"/marketplace":resource_type==="chat"?"/livechat":"/forum";
 await save("community_report",{resource_type,resource_id,reason:value(form.get("reason"))},returnPath);
}

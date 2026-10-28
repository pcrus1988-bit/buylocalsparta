"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createClient} from "../../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../../lib/mazi-api";

const choices=["social","search","marketplace","local_media","print","event"] as const;
const go=(notice:string):never=>redirect("/dashboard/marketing?notice="+notice);
export async function saveMarketingPreferences(form:FormData) {
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const state=await maziMemberRequest<MaziState>("state");
 if(!state.ok||state.application?.status!=="approved"||
 state.member?.status!=="verified"||!state.member.identity_verified_at)go("not_verified");
 const channels=[...new Set(form.getAll("channels").map(String))];
 const region=String(form.get("region")||"").trim();
 const note=String(form.get("member_note")||"").trim();
 if(channels.length>6||channels.some(ch=>!choices.some(allowed=>allowed===ch))||
 region.length>120||note.length>1000)go("invalid");
 const wants=form.get("wants_collective_campaigns")==="yes";
 const {error}=await db.from("mazi_marketing_preferences").upsert({
  member_user_id:user.id,wants_collective_campaigns:wants,
  channels:wants?channels:[],region:wants?region:"",member_note:wants?note:"",
  notice_version:"mazi-marketing-interest-v1"
 },{onConflict:"member_user_id"});
 if(error)go("unavailable");
 revalidatePath("/dashboard/marketing");
 go("saved");
}

export async function respondCreativeInvitation(form:FormData){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const id=String(form.get("invitation_id")||"");
 const status=String(form.get("status")||"");
 if(!/^[0-9a-f-]{36}$/i.test(id)||!["approved","declined","withdrawn"].includes(status))go("creative_invalid");
 const expected=status==="withdrawn"?"approved":"pending";
 const {data,error}=await db.from("mazi_marketing_creative_invitations")
  .update({status,response_note:""})
  .eq("id",id).eq("member_user_id",user.id).eq("status",expected).select("id").maybeSingle();
 if(error||!data)go("creative_failed");
 revalidatePath("/dashboard/marketing");
 go("creative_saved");
}

export async function deleteMarketingPreferences(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const {error}=await db.from("mazi_marketing_preferences").delete().eq("member_user_id",user.id);
 if(error)go("unavailable");
 revalidatePath("/dashboard/marketing");
 go("deleted");
}

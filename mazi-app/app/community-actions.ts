"use server";
import {redirect} from "next/navigation";
import {createClient} from "../lib/supabase/server";
import {maziMemberRequest} from "../lib/mazi-api";

const field=(form:FormData,key:string)=>typeof form.get(key)==="string"?String(form.get(key)).trim():"";
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
async function requireLogin(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
}
const failure=(path:string)=>redirect(path+(path.includes("?")?"&":"?")+"notice=not_saved");

const goodsInput=(form:FormData)=>{
 const kind=field(form,"kind"),item_category=field(form,"item_category"),
  item_condition=field(form,"item_condition"),quantityUnit=field(form,"quantity_unit"),
  quantityText=field(form,"quantity"),location_city=field(form,"location_city"),
  fulfillment=field(form,"fulfillment"),price_type=field(form,"price_type"),
  price_vat_basis=field(form,"price_vat_basis"),priceEur=field(form,"price_eur"),
  title=field(form,"title"),description=field(form,"description");
 const quantity=Number(quantityText);
 if(!["offer","request"].includes(kind)||
   !["equipment","inventory","materials","furniture","electronics","packaging","vehicles","other"].includes(item_category)||
   !["new","used","refurbished","any"].includes(item_condition)||
   (kind==="offer"&&item_condition==="any")||
   !/^\d{1,7}(?:\.\d{1,2})?$/.test(quantityText)||quantity<=0||quantity>1000000||
   !["piece","set","box","pallet","kg","liter"].includes(quantityUnit)||
   location_city.length<2||location_city.length>100||
   !["pickup","shipping","either"].includes(fulfillment)||
   !["fixed","negotiable","on_request"].includes(price_type)||
   !["included","excluded","unspecified"].includes(price_vat_basis)||
   (priceEur!==""&&!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(priceEur))||
   (price_type==="fixed"&&!priceEur)||(price_type==="on_request"&&!!priceEur)||
   title.length<8||title.length>140||description.length<30||description.length>2500||
   form.get("goods_policy_accepted")!=="on")return null;
 let price_cents:number|null=null;
 if(priceEur){
   const [whole,decimal=""]=priceEur.replace(",",".").split(".");
   price_cents=Number(whole)*100+Number((decimal+"00").slice(0,2));
   if(!Number.isSafeInteger(price_cents)||price_cents<1||price_cents>100000000000)return null;
 }
 return {kind,item_category,item_condition,quantity,quantity_unit:quantityUnit,
  location_city,fulfillment,price_type,price_cents,price_vat_basis,title,description,
  goods_policy_accepted:true};
};
export async function publishMaziListing(form:FormData){
 await requireLogin();
 const listing=goodsInput(form);
 if(!listing)failure("/marketplace");
 const result=await maziMemberRequest("marketplace_create",listing!);
 if(!result.ok)failure("/marketplace");
 redirect("/marketplace?notice=created");
}
export async function editMaziListing(form:FormData){
 await requireLogin();
 const listing_id=field(form,"listing_id"),listing=goodsInput(form);
 if(!validId(listing_id)||!listing)failure("/marketplace");
 const result=await maziMemberRequest("marketplace_edit",{...listing!,listing_id});
 if(!result.ok)failure("/marketplace");
 redirect("/marketplace?notice=edited");
}
export async function renewMaziListing(form:FormData){
 await requireLogin();
 const listing_id=field(form,"listing_id");
 if(!validId(listing_id))failure("/marketplace");
 const result=await maziMemberRequest("marketplace_renew",{listing_id});
 if(!result.ok)failure("/marketplace");
 redirect("/marketplace?notice=renewed");
}
export async function closeMaziListing(form:FormData){
 await requireLogin();
 const listing_id=field(form,"listing_id");
 if(!validId(listing_id))failure("/marketplace");
 const result=await maziMemberRequest("marketplace_close",{listing_id});
 if(!result.ok)failure("/marketplace");
 redirect("/marketplace?notice=closed");
}

export async function publishMaziThread(form:FormData){
 await requireLogin();
 const category=field(form,"category"),title=field(form,"title"),body=field(form,"body");
 if(!["general","advice","collaboration"].includes(category)||
    title.length<8||title.length>140||body.length<30||body.length>4000)failure("/forum");
 const result=await maziMemberRequest<{thread_id:string}>("forum_create",{category,title,body});
 if(result.ok===true&&validId(result.thread_id))redirect("/forum/"+result.thread_id+"?notice=created");
 failure("/forum");
}

export async function replyMaziThread(form:FormData){
 await requireLogin();
 const thread_id=field(form,"thread_id"),body=field(form,"body");
 if(!validId(thread_id))failure("/forum");
 const destination="/forum/"+thread_id;
 if(body.length<2||body.length>2000)failure(destination);
 const result=await maziMemberRequest("forum_reply",{thread_id,body});
 if(!result.ok)failure(destination);
 redirect(destination+"?notice=replied");
}

export async function sendMaziChat(form:FormData){
 await requireLogin();
 const body=field(form,"body");
 if(!body||body.length>1000)failure("/livechat");
 const result=await maziMemberRequest("chat_send",{body});
 if(!result.ok)failure("/livechat");
 redirect("/livechat?notice=sent");
}


/** The matching verified-member gateway also validates inquiry participants and content. */
export async function startInquiry(form:FormData){
 await requireLogin();
 const listing_id=field(form,"listing_id"),body=field(form,"body");
 if(!validId(listing_id)||body.length<20||body.length>1500)failure("/marketplace");
 const result=await maziMemberRequest("community_start_inquiry",{listing_id,body});
 if(!result.ok)failure("/marketplace");
 redirect("/inbox?notice=saved");
}
export async function replyInquiry(form:FormData){
 await requireLogin();
 const inquiry_id=field(form,"inquiry_id"),body=field(form,"body");
 if(!validId(inquiry_id))failure("/inbox");
 const destination="/inbox/"+inquiry_id;
 if(body.length<2||body.length>1500)failure(destination);
 const result=await maziMemberRequest("community_reply_inquiry",{inquiry_id,body});
 if(!result.ok)failure(destination);
 redirect(destination+"?notice=saved");
}

export async function updateInquiryState(form:FormData){
 await requireLogin();
 const inquiry_id=field(form,"inquiry_id"),action=field(form,"action");
 if(!validId(inquiry_id)||!["read","close"].includes(action))failure("/inbox");
 const result=await maziMemberRequest("community_inquiry_action",{inquiry_id,action});
 if(!result.ok)failure("/inbox/"+inquiry_id);
 redirect("/inbox/"+inquiry_id+"?notice="+(action==="read"?"read":"closed"));
}

export async function reportInquiryMessage(form:FormData){
 await requireLogin();
 const resource_id=field(form,"resource_id"),reason=field(form,"reason");
 const inquiryId=field(form,"inquiry_id");
 const destination=validId(inquiryId)?"/inbox/"+inquiryId:"/inbox";
 if(!validId(resource_id)||reason.length<20||reason.length>500)failure(destination);
 const result=await maziMemberRequest("community_report",{
   resource_type:"inquiry",resource_id,reason
 });
 if(!result.ok)failure(destination);
 redirect(destination+"?notice=reported");
}

export async function reportMaziCommunity(form:FormData){
 await requireLogin();
 const resource_type=field(form,"resource_type"),resource_id=field(form,"resource_id"),
  reason=field(form,"reason");
 if(!["listing","thread","reply","chat"].includes(resource_type)||
   !validId(resource_id)||reason.length<20||reason.length>500)
  failure("/community/report");
 const result=await maziMemberRequest("community_report",{resource_type,resource_id,reason});
 if(!result.ok)failure("/community/report");
 redirect("/members?notice=report_received");
}

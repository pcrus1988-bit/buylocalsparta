import {NextResponse} from "next/server";
import {normalizeGreekLidlOffers,normalizeGreekStores} from "../../../../../../../scripts/posokanei/lidl-standalone-feed.mjs";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
const STORES_URL="https://stores.lidlplus.com/api/v4/GR";
const OFFERS_URL=(key:string)=>"https://offers.lidlplus.com/app/api/v4/GR/"+key+"/offers";
const permissionOk=()=>process.env.POSOKANEI_LIDL_PUBLIC_LIST_ENABLED==="true"&&
  process.env.POSOKANEI_LIDL_DATA_REUSE_APPROVED==="true";
type CacheSlot={data:unknown;recordedAt:string;expiresAt:number};
const cached=new Map<string,CacheSlot>(),inflight=new Map<string,Promise<CacheSlot>>();
const maxBytes=2_000_000;
async function sourceJson(url:string,ttlMs:number):Promise<CacheSlot>{
 const existing=cached.get(url);
 if(existing&&existing.expiresAt>Date.now())return existing;
 const active=inflight.get(url);
 if(active)return active;
 const job=(async()=>{
   const response=await fetch(url,{cache:"no-store",redirect:"error",
     signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("Lidl source HTTP "+response.status);
   if(Number(response.headers.get("content-length")||0)>maxBytes)throw Error("Oversized Lidl source");
   if(!response.body)throw Error("No Lidl source response");
   const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;
       size+=value.byteLength;if(size>maxBytes)throw Error("Lidl source exceeded limit");parts.push(value);
     }}finally{reader.releaseLock()}
   const full=new Uint8Array(size);let offset=0;
   for(const part of parts){full.set(part,offset);offset+=part.byteLength}
   const slot={data:JSON.parse(new TextDecoder().decode(full)) as unknown,
     recordedAt:new Date().toISOString(),expiresAt:Date.now()+ttlMs};
   cached.set(url,slot);return slot;
 })().finally(()=>inflight.delete(url));
 inflight.set(url,job);return job;
}
export async function GET(request:Request){
 if(!permissionOk())return json({status:"unpublished",source:"lidl_plus_public_offers",
   reason:"commercial_source_review_pending",products:[],stores:[]});
 try{
   const url=new URL(request.url),mode=url.searchParams.get("mode")||"offers";
   if(!["offers","stores"].includes(mode))return json({status:"invalid_request"},400);
   const directory=await sourceJson(STORES_URL,6*60*60*1000);
   const stores=normalizeGreekStores(directory.data);
   if(mode==="stores")return json({status:"ready",stores,source:"lidl_plus_public_offers",
     observedAt:directory.recordedAt});
   const requested=url.searchParams.get("store")||"GR0851";
   if(!/^GR\d{4}$/.test(requested)||!stores.some(s=>s.id===requested))
     return json({status:"invalid_store",products:[]},400);
   const page=Math.max(1,Math.min(200,Number.parseInt(url.searchParams.get("page")||"1",10)||1));
   const q=(url.searchParams.get("q")||"").trim().slice(0,100).normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el");
   const period=url.searchParams.get("period")==="upcoming"?"upcoming":"current";
   const fetched=await sourceJson(OFFERS_URL(requested),30*60*1000);
   const list=normalizeGreekLidlOffers(fetched.data,{storeKey:requested,observedAt:fetched.recordedAt});
   const matches=list.filter(p=>p.validityStatus===period&&
      (!q||[p.name,p.brand||"",p.packaging||"",p.category||""].join(" ").normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el").includes(q)));
   const pageSize=24,selected=matches.slice((page-1)*pageSize,page*pageSize);
   const store=stores.find(s=>s.id===requested);
   return json({status:"ready",source:"lidl_plus_public_offers",store,observedAt:fetched.recordedAt,
     count:matches.length,page,pageSize,hasMore:page*pageSize<matches.length,
     products:selected,matched:false,basketEligible:false,unmatched:true,
     disclaimer:"Ενδεικτικές προσφορές Lidl ανά κατάστημα. Ελέγξτε διαθεσιμότητα και όρους Lidl Plus στο κατάστημα."});
 }catch(error){
   console.error("Lidl catalog unavailable",error instanceof Error?error.message:"unavailable");
   return json({status:"source_unavailable",products:[],stores:[]},503);
 }
}

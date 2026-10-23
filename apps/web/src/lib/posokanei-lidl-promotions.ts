import "server-only";
import {verifiedLidlBadges} from "../../../../scripts/posokanei/lidl-weekly-overlay.mjs";
import type {PublishedReferenceSnapshot} from "./posokanei-public-runtime";

/** Optional source-owned, reviewed retailer promotions, distinct from government pricing. */
type LidlBadge={retailerId:string;retailerName:string;storeKey:string;storeName:string;
  offerPriceEur:number;previousPriceEur:number|null;validFrom:string;validTo:string;
  observedAt:string;offerId:string;scope:"specific_store";basketEligible:false};
let cache:{value:unknown;expires:number}|null=null;
let pending:Promise<unknown>|null=null;
const isSafeHost=(host:string)=>host==="raw.githubusercontent.com"||
  /^[a-z0-9-]+\.supabase\.co$/.test(host)||
  /^[a-z0-9.-]+\.public\.blob\.vercel-storage\.com$/.test(host);
const loadArtifact=async():Promise<unknown>=>{
  const raw=process.env.POSOKANEI_LIDL_PROMOTIONS_URL;
  if(!raw)return null;
  let url:URL;
  try{url=new URL(raw)}catch{return null}
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !isSafeHost(url.hostname))return null;
  if(cache&&cache.expires>Date.now())return cache.value;
  if(!pending){
    pending=(async()=>{
      const result=await fetch(url.toString(),{cache:"no-store",redirect:"error",
        signal:AbortSignal.timeout(15000),headers:{Accept:"application/json"}});
      if(!result.ok)throw Error("Lidl reviewed promotions unavailable");
      if(Number(result.headers.get("content-length")||0)>1_500_000)throw Error("Lidl promotions artifact too large");
      if(!result.body)throw Error("Missing Lidl promotions body");
      const reader=result.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;if(size>1_500_000)throw Error("Lidl artifact exceeds limit");chunks.push(value)}}
      finally{reader.releaseLock()}
      const rawBody=new Uint8Array(size);let offset=0;
      for(const part of chunks){rawBody.set(part,offset);offset+=part.byteLength}
      return JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
    })().then(v=>{cache={value:v,expires:Date.now()+10*60*1000};return v})
      .finally(()=>{pending=null});
  }
  return pending;
};
export async function loadReviewedLidlPromotions(snapshot:PublishedReferenceSnapshot):Promise<Map<string,LidlBadge[]>>{
  if(process.env.POSOKANEI_LIDL_PROMOTIONS_ENABLED!=="true"||
     process.env.POSOKANEI_LIDL_DATA_REUSE_APPROVED!=="true")return new Map();
  try{
    const artifact=await loadArtifact();
    if(!artifact)return new Map();
    return verifiedLidlBadges(snapshot,artifact) as Map<string,LidlBadge[]>;
  }catch(error){
    console.error("Lidl public offer overlay disabled:",error instanceof Error?error.message:"untrusted source");
    return new Map(); // independent service failure must never blank the PosoKanei catalogue
  }
}

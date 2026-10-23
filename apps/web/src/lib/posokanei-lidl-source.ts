import "server-only";
import {normalizeGreekLidlOffers,normalizeGreekStores,type GreekLidlStandaloneOffer,type GreekLidlStore} from "../../../../scripts/posokanei/lidl-standalone-feed.mjs";

const STORES_URL="https://stores.lidlplus.com/api/v4/GR";
const OFFERS_URL=(id:string)=>"https://offers.lidlplus.com/app/api/v4/GR/"+id+"/offers";
type Slot={data:unknown;observedAt:string;expires:number};
const cache=new Map<string,Slot>();
const inflight=new Map<string,Promise<Slot>>();
const LIMIT=2_000_000;
export const lidlPublicEnabled=()=>process.env.POSOKANEI_LIDL_PUBLIC_LIST_ENABLED==="true"&&
  process.env.POSOKANEI_LIDL_DATA_REUSE_APPROVED==="true";
async function getFixedSource(url:string,ttl:number):Promise<Slot>{
  const hit=cache.get(url);
  if(hit&&hit.expires>Date.now())return hit;
  const pending=inflight.get(url);
  if(pending)return pending;
  const task=(async()=>{
    const response=await fetch(url,{cache:"no-store",redirect:"error",
      signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}});
    if(!response.ok)throw Error("Lidl source unavailable: "+response.status);
    if(Number(response.headers.get("content-length")||0)>LIMIT||!response.body)
      throw Error("Invalid or oversized Lidl source");
    const parts:Uint8Array[]=[];let size=0;
    const reader=response.body.getReader();
    try{while(true){const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>LIMIT)throw Error("Lidl source exceeds safe limit");parts.push(value);
    }}finally{reader.releaseLock()}
    const raw=new Uint8Array(size);let off=0;
    for(const p of parts){raw.set(p,off);off+=p.byteLength}
    const slot={data:JSON.parse(new TextDecoder().decode(raw)) as unknown,observedAt:new Date().toISOString(),expires:Date.now()+ttl};
    if(cache.size>250)cache.clear();
    cache.set(url,slot);return slot;
  })().finally(()=>inflight.delete(url));
  inflight.set(url,task);return task;
}
export async function readLidlStores():Promise<{stores:GreekLidlStore[];observedAt:string}>{
  if(!lidlPublicEnabled())throw Error("Lidl source not approved");
  const data=await getFixedSource(STORES_URL,6*60*60*1000);
  return {stores:normalizeGreekStores(data.data),observedAt:data.observedAt};
}
export async function readLidlOffers(storeKey:string):Promise<{store:GreekLidlStore;offers:GreekLidlStandaloneOffer[];observedAt:string}>{
  if(!/^GR\d{4}$/.test(storeKey))throw Error("Unknown Lidl store");
  const {stores}=await readLidlStores();
  const store=stores.find(s=>s.id===storeKey);
  if(!store)throw Error("Unknown Lidl store");
  const slot=await getFixedSource(OFFERS_URL(storeKey),30*60*1000);
  return {store,offers:normalizeGreekLidlOffers(slot.data,{storeKey,observedAt:slot.observedAt}),observedAt:slot.observedAt};
}

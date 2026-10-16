import "server-only";

/**
 * Read-only mirror of *published government-origin product names and prices*.
 * Legal basis used by this release: Greek Law 4727/2020 art. 61 (public-sector
 * commercial/noncommercial reuse), subject to art. 59 exclusions.
 * The third-party archive's MIT source-code license is NOT our data license.
 *
 * Fixed upstream (no user-provided URLs), index/path/date checks, full-snapshot
 * completeness validation, zero-price exclusion, no images or marketplace offers.
 * Per-process TTL coalesces concurrent cold requests and avoids per-keystroke
 * re-downloading of the 20+ MB snapshot.
 */
import {transformSnapshot,sha256} from "../../../../scripts/posokanei/snapshot-adapter.mjs";
import approvedCatalogue from "../../../../scripts/posokanei/approved-equivalence-groups.json";
import {buildApprovedReferenceGroups} from "../../../../scripts/posokanei/reviewed-groups.mjs";
import {deriveAutoCommodityGroups} from "../../../../scripts/posokanei/auto-commodity-groups.mjs";
import {deriveAutoPackagedTypeGroups} from "../../../../scripts/posokanei/auto-packaged-type-groups.mjs";
import {deriveAutoEggGroups} from "../../../../scripts/posokanei/auto-egg-groups.mjs";

const MIRROR_BASE="https://raw.githubusercontent.com/spyrosavl/posokanei/main/";
const MIRROR_TTL_MS=15*60*1000;
// Accept only HTTPS product photographs; retailer logos, badges and internal hosts are never exposed.
function safeProductPhoto(value:unknown):string|null{
  if(typeof value!=="string"||value.length>1500)return null;
  try{
    const u=new URL(value);
    if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
      !u.hostname.includes(".")||/(?:^|\.)localhost$/.test(u.hostname)||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname)||
      /(?:logo|favicon|avatar|retailer|supermarket|sprite|placeholder)/i.test(u.pathname))return null;
    return u.toString();
  }catch{return null;}
}

const MAX_ARCHIVE_BYTES=55_000_000;
const STATUTORY_REUSE_REFERENCE="GR_N4727_2020_ART61_PUBLIC_SECTOR_REUSE";
let mirrorCache:{value:PublishedReferenceSnapshot|null;expires:number}|null=null;
let mirrorPending:Promise<PublishedReferenceSnapshot|null>|null=null;

async function mirrorJson(url:string,maxBytes:number):Promise<{raw:Uint8Array;body:unknown}>{
  const result=await fetch(url,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(25000),headers:{Accept:"application/json"}});
  if(!result.ok)throw new Error("PosoKanei source unavailable: "+result.status);
  const declared=Number(result.headers.get("content-length")||0);
  if(declared>maxBytes)throw new Error("PosoKanei snapshot too large");
  if(!result.body)throw new Error("PosoKanei archive has no body");
  const reader=result.body.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes)throw new Error("PosoKanei snapshot exceeds safe size");
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const raw=new Uint8Array(total);let position=0;
  for(const chunk of chunks){raw.set(chunk,position);position+=chunk.byteLength;}
  return {raw,body:JSON.parse(new TextDecoder().decode(raw)) as unknown};
}

async function readGovernmentMirror():Promise<PublishedReferenceSnapshot|null>{
  const idx=await mirrorJson(MIRROR_BASE+"data/latest.json",20_000);
  const pointer=idx.body as {date?:unknown;path?:unknown;total?:unknown;collected?:unknown}|null;
  if(!pointer||typeof pointer.date!=="string"||!validDate(pointer.date)||
    typeof pointer.path!=="string"||
    pointer.path!=="data/"+pointer.date.slice(0,4)+"/posokanei-"+pointer.date+".json"||
    !Number.isSafeInteger(pointer.total)||pointer.total!==pointer.collected||
    typeof pointer.total!=="number"||pointer.total<1||pointer.total>100000){
    throw new Error("Untrusted PosoKanei archive pointer");
  }
  const result=await mirrorJson(MIRROR_BASE+pointer.path,MAX_ARCHIVE_BYTES);
  const parsed=result.body as {date?:unknown;total?:unknown;collected?:unknown}|null;
  if(!parsed||parsed.date!==pointer.date||
    parsed.total!==pointer.total||parsed.collected!==pointer.collected){
    throw new Error("PosoKanei archive pointer and snapshot disagree");
  }
  const transformed=transformSnapshot(parsed,{countries:["GR"]});
  if(transformed.manifest.warnings.invalid_price_rows!==0||
     transformed.manifest.warnings.missing_price_arrays!==0){
    throw new Error("PosoKanei snapshot failed price-array quality checks");
  }
  if(transformed.references.length!==pointer.total||
     transformed.prices.length===0)throw new Error("Incomplete Greek price-reference archive");

  return {
    schema_version:1,source:"posokanei.gov.gr",
    snapshot_date:transformed.manifest.snapshot_date,
    snapshot_sha256:sha256(result.raw),permission_reference:STATUTORY_REUSE_REFERENCE,
    source_total:transformed.references.length,
    // Explicit projection: never republish source images, stock or vendor offers.
    products:transformed.references.map(p=>({
      source_product_id:p.source_product_id,name:p.name,brand:p.brand,
      category:p.category,unit:p.unit,unit_quantity:p.unit_quantity,
      snapshot_date:p.snapshot_date,image_url:safeProductPhoto(p.image_source_url)
    })),
    observations:transformed.prices.filter(p=>p.price_eur>0).map(p=>({
      source_product_id:p.source_product_id,snapshot_date:p.snapshot_date,
      country:p.country,retailer_id:p.retailer_id,
      retailer_name:p.retailer_name||p.retailer_id,price_eur:p.price_eur,
      source_price_updated_at:p.source_price_updated_at,
      is_discount:p.is_discount
    })),
    // Only individually reviewed, snapshot-pinned source SKU memberships.
    // A drifted title, brand, unit, category or missing member deactivates
    // its entire group until human re-review; never infer from title alone.
    approvedGroups:(()=>{
      const reviewed=buildApprovedReferenceGroups(transformed.references,approvedCatalogue);
      const strict=deriveAutoCommodityGroups(transformed.references,reviewed);
      const more=deriveAutoPackagedTypeGroups(transformed.references,[...reviewed,...strict]);
      const eggs=deriveAutoEggGroups(transformed.references,[...reviewed,...strict,...more]);
      return [...reviewed,...strict,...more,...eggs];
    })()
  };
}
async function cachedGovernmentMirror():Promise<PublishedReferenceSnapshot|null>{
  if(mirrorCache&&mirrorCache.expires>Date.now())return mirrorCache.value;
  if(!mirrorPending){
    mirrorPending=readGovernmentMirror().then(data=>{
      const age=data?Date.now()-Date.parse(data.snapshot_date+"T23:59:59Z"):Infinity;
      const value=age>=-86_400_000&&age<=10*86_400_000?data:null;
      mirrorCache={value,expires:Date.now()+MIRROR_TTL_MS};
      return value;
    }).finally(()=>{mirrorPending=null;});
  }
  return mirrorPending;
}


/**
 * Public market-reference data is completely independent of KONTA MOY vendor offers.
 * Importing a third-party archive does not itself establish redistribution rights.
 * There are THREE independent gates: release flag, verified rights flag, and
 * operator-published artifact with a traceable permission reference.
 */
export type ReferenceProduct = {
  source_product_id:string; name:string; brand:string|null; category:string|null;
  unit:string|null; unit_quantity:number|null; snapshot_date:string; image_url?:string|null;
};
export type ReferenceOffer = {
  source_product_id:string; snapshot_date:string; country:string;
  retailer_id:string; retailer_name:string; price_eur:number;
  source_price_updated_at:string|null; is_discount?:boolean;
};
export type ReferenceGroup = {id:string;label:string;status:"approved";basis:"kg"|"l"|"piece";memberIds:string[];approvalMethod?:"automatic_commodity"};
export type PublishedReferenceSnapshot = {
  schema_version:1; source:string; snapshot_date:string; snapshot_sha256:string;
  permission_reference:string; source_total:number;
  products:ReferenceProduct[]; observations:ReferenceOffer[]; approvedGroups:ReferenceGroup[];
};
const validId=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const validDate=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
export const publicReferenceEnabled=()=>
  process.env.POSOKANEI_PUBLIC_RELEASE_ENABLED==="true" &&
  process.env.POSOKANEI_DATA_REUSE_APPROVED==="true";

export async function loadPublishedReference():Promise<PublishedReferenceSnapshot|null>{
  if(!publicReferenceEnabled())return null;
  if(process.env.POSOKANEI_PUBLIC_SOURCE_MODE==="government_mirror")return cachedGovernmentMirror();
  const configured=process.env.POSOKANEI_PUBLIC_SNAPSHOT_URL;
  if(!configured)return null;
  let url:URL;
  try{url=new URL(configured);}catch{return null;}
  if(url.protocol!=="https:" || url.username || url.password || url.hash)return null;
  const response=await fetch(url.toString(),{next:{revalidate:1800},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error("Reference snapshot unavailable");
  if(Number(response.headers.get("content-length")||0)>50_000_000)throw new Error("Reference snapshot exceeds size limit");
  const raw=await response.text();
  if(raw.length>50_000_000)throw new Error("Reference snapshot exceeds size limit");
  const data:unknown=JSON.parse(raw);
  if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("Invalid published reference");
  const s=data as Partial<PublishedReferenceSnapshot>;
  if(s.schema_version!==1||s.source!=="posokanei.gov.gr"||
    !validDate(s.snapshot_date)||!/^\w{8,120}$/.test(s.permission_reference??"")||
    !/^[a-f0-9]{64}$/.test(s.snapshot_sha256??"")||
    !Number.isSafeInteger(s.source_total)||!Array.isArray(s.products)||!Array.isArray(s.observations)||
    !Array.isArray(s.approvedGroups)||s.products.length!==s.source_total||
    s.products.length>100000||s.observations.length>1_000_000)throw new Error("Unverified published reference");
  // Do not advertise prices more than 10 days after the source snapshot.
  const age=Date.now()-Date.parse(s.snapshot_date+"T23:59:59Z");
  if(age>10*86_400_000||age< -86_400_000)return null;
  const ids=new Set<string>(),prices=new Set<string>();
  for(const p of s.products){
    if(!validId(p?.source_product_id)||ids.has(p.source_product_id)||
      p.snapshot_date!==s.snapshot_date||typeof p.name!=="string"||!p.name.trim()||
      p.name.length>1000)throw new Error("Invalid product in published reference");
    ids.add(p.source_product_id);
  }
  for(const p of s.observations){
    if(!ids.has(p?.source_product_id)||!validId(p.retailer_id)||
      p.snapshot_date!==s.snapshot_date||p.country!=="GR"||
      typeof p.price_eur!=="number"||!Number.isFinite(p.price_eur)||
      p.price_eur<=0||p.price_eur>100000)throw new Error("Invalid price in published reference");
    const key=p.source_product_id+":"+p.retailer_id;
    if(prices.has(key))throw new Error("Duplicate public retailer observation");
    prices.add(key);
  }
  const groupIds=new Set<string>();
  for(const g of s.approvedGroups){
    if(!validId(g?.id)||groupIds.has(g.id)||g.status!=="approved"||
      !["kg","l","piece"].includes(g.basis)||!Array.isArray(g.memberIds)||
      g.memberIds.length<2||g.memberIds.some(id=>!ids.has(id))||
      new Set(g.memberIds).size!==g.memberIds.length||
      typeof g.label!=="string")throw new Error("Invalid public comparison group");
    groupIds.add(g.id);
  }
  return s as PublishedReferenceSnapshot;
}
export const normalizedGreek=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
export function pricedCatalog(snapshot:PublishedReferenceSnapshot){
  const byProduct=new Map<string,ReferenceOffer[]>();
  for(const observation of snapshot.observations){
    const current=byProduct.get(observation.source_product_id)||[];
    current.push(observation);byProduct.set(observation.source_product_id,current);
  }
  for(const offers of byProduct.values())offers.sort((a,b)=>a.price_eur-b.price_eur||a.retailer_id.localeCompare(b.retailer_id));
  const groupId=new Map<string,string>();
  for(const group of snapshot.approvedGroups)for(const id of group.memberIds)if(!groupId.has(id))groupId.set(id,group.id);
  return {byProduct,groupId};
}
export function publicCards(snapshot:PublishedReferenceSnapshot,ids:string[],catalog=pricedCatalog(snapshot)){
  const filter=new Set(ids);
  return snapshot.products.filter(p=>filter.has(p.source_product_id)).map(p=>({
    id:p.source_product_id,name:p.name,brand:p.brand,category:p.category,
    unit:p.unit,unitQuantity:p.unit_quantity,imageUrl:safeProductPhoto(p.image_url),groupId:catalog.groupId.get(p.source_product_id)||null,
    offers:(catalog.byProduct.get(p.source_product_id)||[]).map(o=>({
      retailerId:o.retailer_id,retailerName:o.retailer_name||o.retailer_id,
      priceEur:o.price_eur,observedAt:o.source_price_updated_at,discount:o.is_discount===true
    }))
  }));
}

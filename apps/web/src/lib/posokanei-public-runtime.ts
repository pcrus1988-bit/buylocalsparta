import "server-only";

/**
 * Public market-reference data is completely independent of KONTA MOY vendor offers.
 * Importing a third-party archive does not itself establish redistribution rights.
 * There are THREE independent gates: release flag, verified rights flag, and
 * operator-published artifact with a traceable permission reference.
 */
export type ReferenceProduct = {
  source_product_id:string; name:string; brand:string|null; category:string|null;
  unit:string|null; unit_quantity:number|null; snapshot_date:string;
};
export type ReferenceOffer = {
  source_product_id:string; snapshot_date:string; country:string;
  retailer_id:string; retailer_name:string; price_eur:number;
  source_price_updated_at:string|null; is_discount?:boolean;
};
export type ReferenceGroup = {id:string;label:string;status:"approved";basis:"kg"|"l"|"piece";memberIds:string[]};
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
    unit:p.unit,unitQuantity:p.unit_quantity,groupId:catalog.groupId.get(p.source_product_id)||null,
    offers:(catalog.byProduct.get(p.source_product_id)||[]).map(o=>({
      retailerId:o.retailer_id,retailerName:o.retailer_name||o.retailer_id,
      priceEur:o.price_eur,observedAt:o.source_price_updated_at,discount:o.is_discount===true
    }))
  }));
}

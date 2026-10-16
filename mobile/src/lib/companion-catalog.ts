const API="https://kontamou.site/api/mobile/companion/catalog/search";
export type CompanionCatalogProduct={variantId:string;title:string;slug:string;brand:string};
export async function searchCompanionCatalog(input:string):Promise<CompanionCatalogProduct[]>{
 const query=input.normalize("NFKC").trim().replace(/\s+/g," ");
 if(query.length<2||query.length>72)throw Error("INVALID_SEARCH");
 const signal=AbortSignal.timeout(6500);
 const r=await fetch(API+"?q="+encodeURIComponent(query),{
  headers:{Accept:"application/json"},signal
 });
 if(!r.ok)throw Error(r.status===429?"RATE_LIMITED":"SEARCH_UNAVAILABLE");
 const body=await r.json() as {products?:unknown;source?:unknown;availabilityConfirmed?:unknown};
 if(body.source!=="canonical_catalog"||body.availabilityConfirmed!==false
   ||!Array.isArray(body.products))throw Error("INVALID_RESULTS");
 return body.products.slice(0,12).filter((v):v is CompanionCatalogProduct=>{
  if(!v||typeof v!=="object")return false;
  const p=v as Record<string,unknown>;
  return typeof p.variantId==="string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.variantId)
    && typeof p.title==="string"&&p.title.trim().length>=2&&p.title.length<=120
    && typeof p.slug==="string"&&typeof p.brand==="string";
 });
}

import {studioForKey,normalizeColorHex,type ColorStudioKey} from "./color-studios";
import {validCanonicalPublicId} from "./canonical-id";
const BASE="https://kontamou.site";
export type ColorStudioProduct={
 variantId:string;title:string;brand:string;colorHex:string;colorLabel:string;
 profilePrecision:"exact"|"canonicalized"|"family_estimate"|"unknown";
 priceMinor:number;imagePath:string|null
};
export type StudioMatchResult={products:ColorStudioProduct[];degraded:boolean};
export async function fetchColorStudioMatches(studioKey:ColorStudioKey,hex:string):Promise<StudioMatchResult>{
 const studio=studioForKey(studioKey);
 const color=normalizeColorHex(hex);
 if(!studio||!color)throw Error("INVALID_STUDIO_COLOR");
 const request=new URL(BASE+"/api/mobile/companion/color-studios");
 request.searchParams.set("category",studio.categoryCode);
 request.searchParams.set("color",color);
 const response=await fetch(request.toString(),{
  method:"GET",headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error("COLOR_CATALOG_UNAVAILABLE");
 const data=await response.json() as Record<string,unknown>;
 if(data.source!=="kontamou_color_catalog"||data.category!==studio.categoryCode
  ||data.color!==color||data.availabilityConfirmed!==false
  ||typeof data.degraded!=="boolean"||!Array.isArray(data.products)
  ||data.products.length>24)throw Error("INVALID_COLOR_CATALOG");
 const products:ColorStudioProduct[]=[];
 const seen=new Set<string>();
 for(const row of data.products){
  if(!row||typeof row!=="object")continue;
  const p=row as Record<string,unknown>;
  if(!validCanonicalPublicId(p.variantId)
   ||typeof p.title!=="string"||p.title.length<2||p.title.length>200
   ||typeof p.brand!=="string"||p.brand.length>180
   ||typeof p.colorHex!=="string"||!normalizeColorHex(p.colorHex)
   ||typeof p.colorLabel!=="string"||p.colorLabel.length>200
   ||!["exact","canonicalized","family_estimate","unknown"].includes(String(p.profilePrecision))
   ||!Number.isSafeInteger(p.priceMinor)||(p.priceMinor as number)<=0
   ||(p.imagePath!==null&&!(typeof p.imagePath==="string"&&
    /^\/api\/(catalog-source-image|media)\/[A-Za-z0-9_-]+$/.test(p.imagePath)))
   ||seen.has(p.variantId))continue;
  seen.add(p.variantId);
  products.push(p as ColorStudioProduct);
 }
 return {products,degraded:data.degraded};
}
export function studioImageUrl(path:string|null):string|null{
 if(!path||!/^\/api\/(catalog-source-image|media)\/[A-Za-z0-9_-]+$/.test(path))return null;
 return BASE+path;
}

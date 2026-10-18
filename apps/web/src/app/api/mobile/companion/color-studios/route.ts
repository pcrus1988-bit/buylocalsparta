import {getColorFinderProducts} from "../../../../../lib/color-finder-data";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const CATEGORIES=new Set([
 "studio-nails","studio-lips","studio-eye-makeup","studio-makeup",
 "studio-hair-color","studio-shoes","studio-bags","studio-fashion","studio-home"
]);
const HEX=/^#[0-9a-fA-F]{6}$/;
const NO_STORE={"Cache-Control":"public, s-maxage=120, stale-while-revalidate=300"};
/** Read-only, public, category-isolated matching from the existing governed
 * Color Finder catalogue. Never emits fake products or device-provided prices.
 */
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const category=params.get("category")??"";
 const hex=params.get("color")??"";
 if(!CATEGORIES.has(category)||!HEX.test(hex))
  return Response.json({error:"INVALID_COLOR_REQUEST"},{status:400,headers:{"Cache-Control":"no-store"}});
 try{
  const catalog=await getColorFinderProducts({categoryCode:category,targetHex:hex.toUpperCase()});
  const products=catalog.filter(p=>p.colorEvidence===true
    &&typeof p.id==="string"&&/^[A-Za-z0-9_-]{6,180}$/.test(p.id)
    &&typeof p.title==="string"&&p.title.length<=200
    &&HEX.test(p.colorHex)&&Number.isSafeInteger(p.priceMinor)&&p.priceMinor>0)
    .slice(0,24).map(p=>({
      variantId:p.id,title:p.title,brand:p.brand??"",
      colorHex:p.colorHex.toUpperCase(),colorLabel:p.colorLabel,
      profilePrecision:p.profilePrecision??"unknown",priceMinor:p.priceMinor,
      imagePath:/^\/api\/(catalog-source-image|media)\/[A-Za-z0-9_-]+$/.test(p.imageSrc)
        ?p.imageSrc:null
    }));
  return Response.json({source:"konτα-moy-color-catalog",category,color:hex.toUpperCase(),
    products,degraded:catalog.length===0,availabilityConfirmed:false},{headers:NO_STORE});
 }catch{
  return Response.json({source:"konτα-moy-color-catalog",category,color:hex.toUpperCase(),
    products:[],degraded:true,availabilityConfirmed:false},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}

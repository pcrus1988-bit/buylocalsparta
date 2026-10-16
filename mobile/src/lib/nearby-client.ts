import type {LocationObjectCoords} from "expo-location";
import {getItems} from "./companion-store";
import {matchLocalItems,validNearbyPosition,type MatchedProduct,type ProductCandidate} from "./nearby-matching";

const API="https://kontamou.site/api/mobile/companion/nearby-stock";
export async function scanVerifiedNearbyStock(coords:Pick<LocationObjectCoords,"latitude"|"longitude"|"accuracy">):Promise<{
  products:ProductCandidate[];matches:MatchedProduct[];
}>{
  const accuracy=coords.accuracy??Infinity;
  if(!validNearbyPosition(coords.latitude,coords.longitude,accuracy))throw new Error("LOCATION_NOT_ACCURATE");
  const response=await fetch(API,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({latitude:coords.latitude,longitude:coords.longitude,accuracy}),
  });
  if(!response.ok)throw new Error(response.status===429?"RATE_LIMITED":"NEARBY_UNAVAILABLE");
  const payload=await response.json() as {products?:ProductCandidate[];verifiedOnly?:boolean};
  if(payload.verifiedOnly!==true || !Array.isArray(payload.products))throw new Error("INVALID_RESPONSE");
  const products=payload.products.filter(p=>
    typeof p.vendorId==="string"&&typeof p.productTitle==="string"
    &&typeof p.productUrl==="string"&&p.productUrl.startsWith("https://kontamou.site/")
    &&Number.isFinite(p.distanceM)&&p.distanceM>=0&&p.distanceM<=550);
  const items=await getItems();
  return{products,matches:matchLocalItems(items,products)};
}

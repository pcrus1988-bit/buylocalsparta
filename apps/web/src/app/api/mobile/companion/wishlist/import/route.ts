import {companionAddSavedProducts,requireMobileBearer} from "../../../../../../lib/companion-mobile-auth";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const H={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};

export async function POST(request:Request){
 try{
  const principal=await requireMobileBearer(request);
  const raw=await request.text();
  if(raw.length>2200)return Response.json({error:"INVALID_REQUEST"},{status:400,headers:H});
  const payload=JSON.parse(raw) as {variantIds?:unknown};
  const result=await companionAddSavedProducts(principal.userId,payload.variantIds);
  return Response.json(result,{headers:H});
 }catch{
  return Response.json({error:"WISHLIST_SYNC_UNAVAILABLE"},{status:400,headers:H});
 }
}

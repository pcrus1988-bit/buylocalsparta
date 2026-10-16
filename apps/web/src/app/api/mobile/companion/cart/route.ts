import {requireMobileBearer,companionEnabled} from "../../../../../lib/companion-mobile-auth";
import {getProductionPostgresRuntime} from "../../../../../lib/postgres-runtime";
import {companionCartRevision,parseCompanionCartPut} from "../../../../../lib/companion-cart-policy";
import {postgresCommerceEnabled} from "../../../../../lib/customer-commerce-runtime";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const H={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
function enabled(){
 return companionEnabled()&&process.env.COMPANION_ANDROID_CART_ENABLED==="true"&&postgresCommerceEnabled();
}
function publicCart(cart:Awaited<ReturnType<ReturnType<typeof getProductionPostgresRuntime>["customerCommerce"]["customerCart"]>>){
 return {revision:companionCartRevision(cart),updatedAt:cart.id?cart.updatedAt:null,currency:"EUR" as const,
   // Snapshot price is indicative; browser checkout requotes all offers and shipping.
   priceFinal:false,availabilityFinal:false,
   items:cart.items.map(item=>({canonicalVariantId:item.canonicalVariantId,title:item.title,
     quantity:item.quantity,priceMinor:item.priceMinor,available:item.available}))};
}
export async function GET(request:Request){
 if(!enabled())return Response.json({error:"NOT_ENABLED"},{status:503,headers:H});
 try{
  const user=await requireMobileBearer(request);
  const cart=await getProductionPostgresRuntime().customerCommerce.customerCart(user.publicId);
  return Response.json({cart:publicCart(cart)},{headers:H});
 }catch{
  return Response.json({error:"UNAUTHORIZED_OR_UNAVAILABLE"},{status:401,headers:H});
 }
}
export async function PUT(request:Request){
 if(!enabled())return Response.json({error:"NOT_ENABLED"},{status:503,headers:H});
 try{
  const user=await requireMobileBearer(request);
  const raw=await request.text();
  if(raw.length>15500)return Response.json({error:"INVALID_CART"},{status:400,headers:H});
  let requested:ReturnType<typeof parseCompanionCartPut>;
  try{requested=parseCompanionCartPut(JSON.parse(raw));}
  catch{return Response.json({error:"INVALID_CART"},{status:400,headers:H});}
  const commerce=getProductionPostgresRuntime().customerCommerce;
  const current=await commerce.customerCart(user.publicId);
  if(companionCartRevision(current)!==requested.revision ||
    (current.id?current.updatedAt:null)!==requested.expectedUpdatedAt){
   return Response.json({error:"CART_CHANGED",cart:publicCart(current)},{status:409,headers:H});
  }
  // Shared marketplace persistence: no orders, reservations or payments created here.
  // Existing browser cart and checkout will read this same signed-in user's cart.
  await commerce.syncCustomerCart({customerId:user.publicId,items:requested.items,now:Date.now(),expectedUpdatedAt:requested.expectedUpdatedAt});
  const updated=await commerce.customerCart(user.publicId);
  return Response.json({cart:publicCart(updated)},{headers:H});
 }catch(error){
  const message=error instanceof Error?error.message:"";
  if(message==="CART_CHANGED")return Response.json({error:"CART_CHANGED"},{status:409,headers:H});
  if(/not publicly available|Invalid cart|Invalid cart product/.test(message))
   return Response.json({error:"PRODUCT_UNAVAILABLE"},{status:409,headers:H});
  return Response.json({error:"CART_UNAVAILABLE"},{status:503,headers:H});
 }
}

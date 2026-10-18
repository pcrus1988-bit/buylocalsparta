import { hospitalityIdentity } from "../../../../../../lib/hospitality-partner-access";
import { assertCustomerCsrf } from "../../../../../../lib/customer-state-runtime";
import { DrinkStockMarketError,drinkStockMarketSnapshot,mutateDrinkStockMarket } from "../../../../../../lib/drinkstock-market-service";
import { validateMarketAction } from "../../../../../../lib/drinkstock-market-pricing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};

type Params={partnerId:string;venueId:string};
function fail(error:unknown){
  const code=error instanceof DrinkStockMarketError?error.code:"MARKET_UNAVAILABLE";
  const pgCode=error&&typeof error==="object"&&"code" in error?String(error.code):"";
  const status=error instanceof DrinkStockMarketError?error.status:pgCode==="23505"?409:503;
  return Response.json({error:pgCode==="23505"?"PRODUCT_ALREADY_EXISTS":code},{status,headers});
}
export async function GET(_request:Request,{params}:{params:Promise<Params>}){
  try{
    const session=await hospitalityIdentity();
    if(!session)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
    const {partnerId,venueId}=await params;
    return Response.json(await drinkStockMarketSnapshot(session.userId,partnerId,venueId),{headers});
  }catch(error){return fail(error);}
}
export async function POST(request:Request,{params}:{params:Promise<Params>}){
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return Response.json({error:"INVALID_ORIGIN"},{status:403,headers});
  try{
    const session=await hospitalityIdentity();
    if(!session)return Response.json({error:"AUTH_REQUIRED"},{status:401,headers});
    assertCustomerCsrf(session,request.headers.get("x-csrf-token")??undefined);
    let action;
    try{action=validateMarketAction(await request.json());}
    catch{return Response.json({error:"INVALID_ACTION_PAYLOAD"},{status:400,headers});}
    const {partnerId,venueId}=await params;
    return Response.json(await mutateDrinkStockMarket(session.userId,partnerId,venueId,action),{headers});
  }catch(error){
    if(error instanceof Error&&/CSRF validation failed/.test(error.message))
      return Response.json({error:"INVALID_CSRF"},{status:403,headers});
    return fail(error);
  }
}

import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../lib/account-runtime";
import { logoutCustomer } from "../../../../lib/customer-state-runtime";

export async function POST(request: Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return Response.json({error:"INVALID_ORIGIN"},{status:403,headers:{"cache-control":"no-store"}});
  const store=await cookies();
  const token=store.get(ACCOUNT_SESSION_COOKIE)?.value;
  if(token) await logoutCustomer(token);
  store.set({name:ACCOUNT_SESSION_COOKIE,value:"",path:"/",expires:new Date(0),httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"});
  return Response.json({ok:true},{headers:{"cache-control":"no-store"}});
}
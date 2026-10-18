import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../lib/account-runtime";
import { accessibleDrinkStockPartners } from "../../../../lib/hospitality-partner-access";
import { authenticateCustomer, consumeCustomerLoginRateLimit } from "../../../../lib/customer-state-runtime";
import { productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export async function POST(request: Request) {
  // Login is first-party only; do not allow cross-origin login CSRF.
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    return Response.json({error:"INVALID_ORIGIN"},{status:403,headers:{"cache-control":"no-store"}});
  }
  const visitorKey=request.headers.get("x-bls-visitor")?.trim();
  if(!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey))
    return Response.json({error:"INVALID_REQUEST"},{status:400,headers:{"cache-control":"no-store"}});
  if(!productionDatabaseConfigured())
    return Response.json({error:"SERVICE_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});
  try {
    const decision=await consumeCustomerLoginRateLimit({visitorKey,now:Date.now()});
    if(!decision.allowed)
      return Response.json({error:"RATE_LIMITED"},{status:429,headers:{"retry-after":String(Math.ceil(decision.retryAfterMs/1000)),"cache-control":"no-store"}});
    const body=await request.json() as {email?:unknown;password?:unknown};
    const email=typeof body.email==="string"?body.email.trim():"";
    const password=typeof body.password==="string"?body.password:"";
    if(!email||!password||email.length>254||password.length>1024)
      return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers:{"cache-control":"no-store"}});
    const result=await authenticateCustomer({email,password,now:Date.now()});
    if(!result.principal.roles.includes("customer"))
      return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers:{"cache-control":"no-store"}});
    const memberships=await accessibleDrinkStockPartners(result.principal.userId);
    if(!memberships.length)
      return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers:{"cache-control":"no-store"}});
    (await cookies()).set({
      name:ACCOUNT_SESSION_COOKIE,
      value:result.token,
      httpOnly:true,
      sameSite:"lax",
      secure:process.env.NODE_ENV==="production" || requestOrigin.startsWith("https://"),
      path:"/",
      expires:new Date(result.expiresAt)
    });
    return Response.json({authenticated:true},{headers:{"cache-control":"no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"";
    if(/relation "hospitality_|connect|timeout|too many clients|unavailable|ECONN|ETIMEDOUT/i.test(message))
      return Response.json({error:"SERVICE_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});
    return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers:{"cache-control":"no-store"}});
  }
}
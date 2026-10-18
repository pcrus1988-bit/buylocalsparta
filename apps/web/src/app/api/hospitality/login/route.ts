import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../lib/account-runtime";
import { accessibleDrinkStockPartners } from "../../../../lib/hospitality-partner-access";
import { authenticateCustomer, consumeCustomerLoginRateLimit } from "../../../../lib/customer-state-runtime";
import { hospitalityLoginRateLimitKey } from "../../../../lib/hospitality-login-security";
import { productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

const headers={"cache-control":"private, no-store","x-robots-tag":"noindex, nofollow"};

export async function POST(request: Request) {
  // First party only. Password and tokens are never exposed in error responses.
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({error:"INVALID_ORIGIN"},{status:403,headers});
  if (!productionDatabaseConfigured())
    return Response.json({error:"SERVICE_UNAVAILABLE"},{status:503,headers});
  const secret=process.env.BLS_AUTH_SECRET?.trim()??"";
  if(secret.length<32)
    return Response.json({error:"SERVICE_UNAVAILABLE"},{status:503,headers});
  try {
    const body=await request.json() as {email?:unknown;password?:unknown};
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const password=typeof body?.password==="string"?body.password:"";
    if(!email||!password||email.length>254||password.length>1024)
      return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers});
    // An arbitrary client-sent visitor key cannot bypass per-account throttling.
    const visitorKey=hospitalityLoginRateLimitKey(email,secret);
    const decision=await consumeCustomerLoginRateLimit({visitorKey,now:Date.now()});
    if(!decision.allowed)
      return Response.json({error:"RATE_LIMITED"},{status:429,headers:{...headers,"retry-after":String(Math.ceil(decision.retryAfterMs/1000))}});
    const result=await authenticateCustomer({email,password,now:Date.now()});
    if(!result.principal.roles.includes("customer"))
      return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers});
    if(!(await accessibleDrinkStockPartners(result.principal.userId)).length)
      return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers});
    (await cookies()).set({
      name:ACCOUNT_SESSION_COOKIE,
      value:result.token,
      httpOnly:true,
      sameSite:"lax",
      secure:process.env.NODE_ENV==="production" || request.url.startsWith("https://"),
      path:"/",
      expires:new Date(result.expiresAt)
    });
    return Response.json({authenticated:true},{headers});
  } catch(error) {
    const message=error instanceof Error?error.message:"";
    if(/relation "hospitality_|connect|timeout|too many clients|unavailable|ECONN|ETIMEDOUT/i.test(message))
      return Response.json({error:"SERVICE_UNAVAILABLE"},{status:503,headers});
    return Response.json({error:"INVALID_CREDENTIALS"},{status:401,headers});
  }
}

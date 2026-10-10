import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, authenticateAdmin, consumeAdminLoginLimit, recordAdminAudit, recordAdminSecurityEvent } from "../../../../lib/admin-runtime";
import { assertFiscalOrigin } from "../../../../lib/fiscal-auth";
export const runtime="nodejs";

export async function POST(request:Request) {
 const visitor=request.headers.get("x-bls-visitor")?.trim();
 try {
  assertFiscalOrigin(request);
  if(!visitor||!/^[A-Za-z0-9_-]{16,128}$/.test(visitor))
   return Response.json({error:"TRUSTED_VISITOR_REQUIRED"},{status:400});
  const now=Date.now(),decision=await consumeAdminLoginLimit(visitor,now);
  if(!decision.allowed)return Response.json({error:"LOGIN_RATE_LIMITED"},{status:429});
  const body=await request.json() as Record<string,unknown>;
  const email=typeof body.email==="string"?body.email.trim():"";
  const password=typeof body.password==="string"?body.password:"";
  if(!email||!password)throw new Error("INVALID_CREDENTIALS");
  // Authenticate against EXISTING KONTA MOY credentials, without provisioning a Fiscal password.
  const result=await authenticateAdmin({email,password,now});
  if(result.principal.vendorId||!result.principal.roles.includes("super_admin"))
   throw new Error("FISCAL_SUPER_ADMIN_REQUIRED");
  (await cookies()).set(ADMIN_SESSION_COOKIE,result.token,{
   httpOnly:true,sameSite:"strict",
   secure:process.env.NODE_ENV==="production"||request.url.startsWith("https://"),
   path:"/",expires:new Date(result.expiresAt)
  });
  await recordAdminAudit(result.principal,"fiscal.super_admin.login","session",result.principal.sessionId);
  return Response.json({role:"super_admin",csrfToken:result.principal.csrfToken});
 }catch(error) {
  await recordAdminSecurityEvent({
   type:"auth.login_failed",severity:"medium",route:"/timologio-admin/api/login",method:"POST",
   subjectHash:createHash("sha256").update("fiscal-admin:"+String(visitor??"unknown")).digest("hex"),
   details:{reason:error instanceof Error?error.message:"login_failed"},occurredAt:Date.now()
  }).catch(()=>undefined);
  return Response.json({error:"INVALID_FISCAL_ADMIN_CREDENTIALS_OR_ROLE"},{status:401});
 }
}

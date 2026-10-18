import { requireAdminSession } from "../../../../lib/admin-session";
import { hospitalityAdminPartners, provisionHospitalityPartner } from "../../../../lib/hospitality-admin-service";
import { HospitalityProvisionInputError, parseHospitalityProvisionInput } from "../../../../lib/hospitality-provision-input";

const headers = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(request,{permission:"vendor.manage"});
    return Response.json({partners:await hospitalityAdminPartners(principal)},{headers});
  } catch {
    return Response.json({error:"UNAUTHORIZED"},{status:403,headers});
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      return Response.json({error:"INVALID_ORIGIN"},{status:403,headers});
    const principal = await requireAdminSession(request,{csrf:true,permission:"vendor.manage"});
    const body = await request.json();
    const input = parseHospitalityProvisionInput(body);
    const result = await provisionHospitalityPartner(principal,input);
    return Response.json(result,{status:201,headers});
  } catch(error) {
    const message = error instanceof Error ? error.message : "";
    const pgCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (error instanceof HospitalityProvisionInputError)
      return Response.json({error:error.code},{status:400,headers});
    if (pgCode === "23505") return Response.json({error:"PARTNER_SLUG_ALREADY_EXISTS"},{status:409,headers});
    if (message === "OWNER_ACCOUNT_NOT_VERIFIED")
      return Response.json({error:message},{status:422,headers});
    if (/ADMIN_AUTH_REQUIRED|Admin permission required|CSRF validation failed/.test(message))
      return Response.json({error:"UNAUTHORIZED"},{status:403,headers});
    return Response.json({error:"HOSPITALITY_PROVISIONING_UNAVAILABLE"},{status:503,headers});
  }
}

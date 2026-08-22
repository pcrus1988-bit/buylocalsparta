import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminReplyToCustomerSupportCase } from "../../../../../../lib/admin-customer-support-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "customer.manage" });
    const body = await request.json() as Record<string, unknown>;
    const result = await adminReplyToCustomerSupportCase(principal, {
      caseId: String(body.caseId ?? ""),
      message: String(body.reason ?? body.message ?? ""),
      now: Date.now()
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "customer_support_reply_failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminCustomerSupportAction, type CustomerSupportAction } from "../../../../../lib/admin-customer-management";

const ACTIONS = ["revoke_sessions", "send_password_reset", "resend_verification"] as const satisfies readonly CustomerSupportAction[];

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "customer.manage" });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "") as CustomerSupportAction;
    if (!ACTIONS.includes(action)) throw new Error("Unsupported customer action");
    const result = await adminCustomerSupportAction(principal, {
      customerId: String(body.customerId ?? ""),
      action,
      reason: String(body.reason ?? "")
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "customer_action_failed" }, { status: 400 });
  }
}

import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminApproveCustomerEmail,
  adminCancelCustomerEmail,
  adminSaveCustomerEmailDraft,
  adminSendApprovedCustomerEmail
} from "../../../../../lib/admin-customer-email";

const ACTIONS = ["save", "approve", "send", "cancel"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "customer.manage" });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "") as Action;
    if (!ACTIONS.includes(action)) throw new Error("Unsupported customer email action");
    const customerId = String(body.customerId ?? "");
    const messageId = String(body.messageId ?? "");
    const reason = String(body.reason ?? "");

    if (action === "save") {
      const result = await adminSaveCustomerEmailDraft(principal, {
        customerId,
        messageId: messageId || undefined,
        subject: String(body.subject ?? ""),
        body: String(body.body ?? ""),
        reason
      });
      return Response.json(result);
    }
    if (action === "approve") return Response.json(await adminApproveCustomerEmail(principal, { customerId, messageId, reason }));
    if (action === "cancel") return Response.json(await adminCancelCustomerEmail(principal, { customerId, messageId, reason }));
    return Response.json(await adminSendApprovedCustomerEmail(principal, { customerId, messageId, reason }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "customer_email_action_failed" }, { status: 400 });
  }
}

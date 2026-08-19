import { requireAdminSession } from "../../../../../../lib/admin-session";
import {
  adminCreateCustomerSupportCase,
  adminCustomerSupportCaseAction,
  CUSTOMER_SUPPORT_CATEGORIES,
  CUSTOMER_SUPPORT_PRIORITIES,
  CUSTOMER_SUPPORT_STATUSES,
  type CustomerSupportCaseAction,
  type CustomerSupportCategory,
  type CustomerSupportPriority,
  type CustomerSupportStatus
} from "../../../../../../lib/admin-customer-support";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "customer.manage" });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "create") {
      const category = String(body.category ?? "") as CustomerSupportCategory;
      const priority = String(body.priority ?? "") as CustomerSupportPriority;
      if (!CUSTOMER_SUPPORT_CATEGORIES.includes(category)) throw new Error("Unsupported support category");
      if (!CUSTOMER_SUPPORT_PRIORITIES.includes(priority)) throw new Error("Unsupported support priority");
      const result = await adminCreateCustomerSupportCase(principal, {
        customerId: String(body.customerId ?? ""),
        subject: String(body.subject ?? ""),
        category,
        priority,
        note: String(body.note ?? ""),
        followUpAt: typeof body.followUpAt === "string" || typeof body.followUpAt === "number" ? body.followUpAt : undefined
      });
      return Response.json(result);
    }

    const caseAction = action as CustomerSupportCaseAction;
    if (!["add_note", "set_status", "set_priority", "assign_self", "clear_assignee", "set_follow_up"].includes(caseAction)) throw new Error("Unsupported support case action");
    const status = body.status === undefined ? undefined : String(body.status) as CustomerSupportStatus;
    const priority = body.priority === undefined ? undefined : String(body.priority) as CustomerSupportPriority;
    if (status !== undefined && !CUSTOMER_SUPPORT_STATUSES.includes(status)) throw new Error("Unsupported support status");
    if (priority !== undefined && !CUSTOMER_SUPPORT_PRIORITIES.includes(priority)) throw new Error("Unsupported support priority");
    const result = await adminCustomerSupportCaseAction(principal, {
      caseId: String(body.caseId ?? ""),
      action: caseAction,
      reason: String(body.reason ?? ""),
      status,
      priority,
      followUpAt: body.followUpAt === null || typeof body.followUpAt === "string" || typeof body.followUpAt === "number" ? body.followUpAt as string | number | null : undefined
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "customer_support_case_action_failed" }, { status: 400 });
  }
}

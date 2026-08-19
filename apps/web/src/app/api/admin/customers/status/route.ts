import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminUpdateCustomerStatus, CUSTOMER_STATUSES, type CustomerStatus } from "../../../../../lib/admin-customer-management";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "customer.manage" });
    const body = await request.json() as Record<string, unknown>;
    const status = String(body.status ?? "") as CustomerStatus;
    if (!CUSTOMER_STATUSES.includes(status)) throw new Error("Unsupported customer status");
    const result = await adminUpdateCustomerStatus(principal, {
      customerId: String(body.customerId ?? ""),
      status,
      reason: String(body.reason ?? "")
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "customer_status_update_failed" }, { status: 400 });
  }
}

import { requireAccountSession } from "../../../../../../lib/account-session";
import { requestCustomerReturn } from "../../../../../../lib/account-view";
import { CUSTOMER_RETURN_REASONS, type CustomerReturnReason } from "../../../../../../lib/customer-returns-service";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function POST(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const orderLineId = typeof body.orderLineId === "string" ? body.orderLineId.trim() : "";
    const quantity = Number(body.quantity);
    const reason = typeof body.reason === "string" ? body.reason : "";
    const requestedRemedy = typeof body.requestedRemedy === "string" ? body.requestedRemedy : "";
    const note = typeof body.note === "string" ? body.note.trim() : undefined;
    if (!orderLineId) throw new Error("Order line is required");
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Return quantity must be a positive integer");
    if (!CUSTOMER_RETURN_REASONS.includes(reason as CustomerReturnReason)) throw new Error("Choose a valid return reason");
    // Customer self-service is intentionally limited to the remedy that is wired end-to-end
    // through admin approval and Viva. Replacement/repair remain platform-assigned workflows.
    if (requestedRemedy !== "refund") throw new Error("Customer self-service currently supports refund requests only");
    return Response.json(await requestCustomerReturn(principal, {
      orderId: id,
      orderLineId,
      quantity,
      reason: reason as CustomerReturnReason,
      requestedRemedy: "refund",
      note
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "return_request_failed";
    const status = ["ORDER_NOT_FOUND", "ORDER_OR_LINE_NOT_FOUND"].includes(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

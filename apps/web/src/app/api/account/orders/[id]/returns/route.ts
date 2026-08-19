import { requireAccountSession } from "../../../../../../lib/account-session";
import { requestCustomerReturn } from "../../../../../../lib/account-view";
import { CUSTOMER_RETURN_REASONS, CUSTOMER_RETURN_REMEDIES, type CustomerReturnReason, type CustomerReturnRemedy } from "../../../../../../lib/customer-returns-service";

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
    if (!CUSTOMER_RETURN_REMEDIES.includes(requestedRemedy as CustomerReturnRemedy)) throw new Error("Choose a valid requested remedy");
    return Response.json(await requestCustomerReturn(principal, {
      orderId: id,
      orderLineId,
      quantity,
      reason: reason as CustomerReturnReason,
      requestedRemedy: requestedRemedy as CustomerReturnRemedy,
      note
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "return_request_failed";
    const status = ["ORDER_NOT_FOUND", "ORDER_OR_LINE_NOT_FOUND"].includes(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

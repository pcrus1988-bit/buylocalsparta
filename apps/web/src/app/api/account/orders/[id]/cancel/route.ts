import { requireAccountSession } from "../../../../../../lib/account-session";
import { cancelCustomerOrder } from "../../../../../../lib/account-view";
import { sendTransactionalEmailBestEffort } from "../../../../../../lib/transactional-email";

type Context = Readonly<{ params: Promise<{ id: string }> }>;
export async function POST(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const body = await request.json() as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3 || reason.length > 500) throw new Error("A cancellation reason between 3 and 500 characters is required");
    const result = await cancelCustomerOrder(principal, { orderId: id, reason });
    await sendTransactionalEmailBestEffort({
      to: principal.email,
      subject: `Η παραγγελία σου ακυρώθηκε · ${result.referenceNumber}`,
      text: [
        `Η παραγγελία ${result.referenceNumber} ακυρώθηκε επιτυχώς.`,
        "",
        `Αιτία ακύρωσης: ${reason}`,
        "",
        "Αν απαιτείται επιστροφή ποσού, η σχετική εξέλιξη θα εμφανιστεί στην παραγγελία σου και θα λάβεις ξεχωριστή ενημέρωση."
      ].join("\n"),
      eventType: "order.cancelled",
      idempotencyKey: `customer-order-cancelled:${id}`,
      payload: {
        orderId: id,
        orderReference: result.referenceNumber,
        ctaPath: `/account/orders/${encodeURIComponent(id)}`,
        ctaLabel: "Προβολή παραγγελίας"
      }
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "order_cancellation_failed";
    return Response.json({ error: message }, { status: message === "ORDER_NOT_FOUND" ? 404 : 400 });
  }
}

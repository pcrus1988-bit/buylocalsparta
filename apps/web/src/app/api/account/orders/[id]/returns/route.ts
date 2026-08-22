import { requireAccountSession } from "../../../../../../lib/account-session";
import { requestCustomerReturn } from "../../../../../../lib/account-view";
import { CUSTOMER_RETURN_REASONS, CUSTOMER_RETURN_REMEDIES, type CustomerReturnReason, type CustomerReturnRemedy } from "../../../../../../lib/customer-returns-service";
import { sendTransactionalEmailBestEffort } from "../../../../../../lib/transactional-email";

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
    if (!CUSTOMER_RETURN_REMEDIES.includes(requestedRemedy as CustomerReturnRemedy)) throw new Error("Choose a valid preferred remedy");
    const result = await requestCustomerReturn(principal, {
      orderId: id,
      orderLineId,
      quantity,
      reason: reason as CustomerReturnReason,
      requestedRemedy: requestedRemedy as CustomerReturnRemedy,
      note
    });
    const latestReturn = result.returns[0];
    const reference = latestReturn?.returnNumber ?? result.referenceNumber;
    const remedyLabel = requestedRemedy === "replacement" ? "Αντικατάσταση" : requestedRemedy === "repair" ? "Επισκευή" : "Επιστροφή χρημάτων";
    await sendTransactionalEmailBestEffort({
      to: principal.email,
      subject: `Λάβαμε το αίτημα επιστροφής · ${reference}`,
      text: [
        `Λάβαμε το αίτημα επιστροφής για την παραγγελία ${result.referenceNumber}.`,
        "",
        `Αριθμός αιτήματος: ${reference}`,
        `Ποσότητα: ${quantity}`,
        `Προτιμώμενη λύση: ${remedyLabel}`,
        "",
        "Η ομάδα KONTA MOY θα ελέγξει την επιλεξιμότητα και τη διαθέσιμη λύση και θα σε ενημερώσει για τα επόμενα βήματα. Μην αποστείλεις το προϊόν πριν λάβεις οδηγίες επιστροφής."
      ].join("\n"),
      eventType: "return.requested",
      idempotencyKey: `customer-return-requested:${reference}:${orderLineId}`,
      payload: {
        orderReference: result.referenceNumber,
        returnReference: reference,
        requestedRemedy,
        ctaPath: `/account/orders/${encodeURIComponent(result.referenceNumber)}`,
        ctaLabel: "Προβολή αιτήματος"
      }
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "return_request_failed";
    const status = ["ORDER_NOT_FOUND", "ORDER_OR_LINE_NOT_FOUND"].includes(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

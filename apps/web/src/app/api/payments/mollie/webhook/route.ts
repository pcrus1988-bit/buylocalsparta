import { parseMollieWebhookBody } from "@buy-local-sparta/mollie-payments";
import { finalizeCapturedCustomerPayment } from "../../../../../lib/customer-payment-finalization";
import { finalizePaidDropshipFulfilment } from "../../../../../lib/dropship-paid-fulfilment";
import { reconcileMolliePaymentSafely } from "../../../../../lib/mollie-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const now = Date.now();
    const paymentId = parseMollieWebhookBody(await request.text());
    const reconciliation = await reconcileMolliePaymentSafely({ paymentId, source: "webhook", now });
    if (["captured", "partially_refunded", "refunded"].includes(reconciliation.paymentStatus) && reconciliation.orderStatus !== "cancelled") {
      await finalizeCapturedCustomerPayment(reconciliation.orderId, now);
      await finalizePaidDropshipFulfilment(reconciliation.orderId, now);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "mollie_webhook_failed" }, { status: 503 });
  }
}

import { requireAccountSession } from "../../../../../../lib/account-session";
import { requireCustomerOrderReference } from "../../../../../../lib/customer-order-reference";
import { resumeCustomerOrderPayment } from "../../../../../../lib/customer-payment-resume";
import { getVisitorKey } from "../../../../../../lib/visitor";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function POST(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    if (!principal.roles.includes("customer")) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const { id } = await params;
    const resolved = await requireCustomerOrderReference(principal, id);
    const visitorKey = await getVisitorKey();
    const payment = await resumeCustomerOrderPayment(principal, { orderId: resolved.internalId, visitorKey });
    return Response.json(payment, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_resume_failed";
    if (message === "AUTH_REQUIRED") return Response.json({ error: message }, { status: 401 });
    if (message === "ORDER_NOT_FOUND") return Response.json({ error: message }, { status: 404 });
    if (message === "PAYMENT_SERVICE_UNAVAILABLE") return Response.json({ error: "Η ασφαλής πληρωμή δεν είναι προσωρινά διαθέσιμη." }, { status: 503 });
    if (message === "PAYMENT_WINDOW_EXPIRED") return Response.json({ error: "Το χρονικό παράθυρο ασφαλούς πληρωμής έληξε και το απόθεμα δεν είναι πλέον δεσμευμένο. Ανανέωσε την παραγγελία για να δεις την τρέχουσα κατάστασή της." }, { status: 409 });
    if (message === "PAYMENT_NOT_PENDING") return Response.json({ error: "Η παραγγελία δεν βρίσκεται πλέον σε αναμονή πληρωμής." }, { status: 409 });
    return Response.json({ error: message }, { status: 400 });
  }
}

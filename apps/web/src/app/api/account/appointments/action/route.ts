import { requireAccountSession } from "../../../../../lib/account-session";
import { cancelCustomerAppointment, rescheduleCustomerAppointment } from "../../../../../lib/customer-appointments-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "cancel") {
      return Response.json({ appointment: await cancelCustomerAppointment(principal, appointmentId) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "reschedule") {
      return Response.json({ appointment: await rescheduleCustomerAppointment(principal, {
        appointmentId,
        startsAt: typeof body.startsAt === "number" ? body.startsAt : Number(body.startsAt),
        durationMinutes: typeof body.durationMinutes === "number" ? body.durationMinutes : Number(body.durationMinutes)
      }) }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new Error("Η ενέργεια ραντεβού δεν υποστηρίζεται.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "appointment_action_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

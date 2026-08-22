import { requireAccountSession } from "../../../../lib/account-session";
import { bookCustomerAppointment, customerAppointmentAdvisers, customerAppointments } from "../../../../lib/customer-appointments-runtime";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const [appointments, advisers] = await Promise.all([customerAppointments(principal), customerAppointmentAdvisers(principal)]);
    return Response.json({ appointments, advisers, csrfToken: principal.csrfToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "appointments_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const appointment = await bookCustomerAppointment(principal, {
      vendorId: typeof body.vendorId === "string" ? body.vendorId : "",
      adviserId: typeof body.adviserId === "string" ? body.adviserId : "",
      startsAt: typeof body.startsAt === "number" ? body.startsAt : Number(body.startsAt),
      durationMinutes: typeof body.durationMinutes === "number" ? body.durationMinutes : Number(body.durationMinutes),
      channel: typeof body.channel === "string" ? body.channel : "",
      notes: typeof body.notes === "string" ? body.notes : undefined,
      canonicalVariantId: typeof body.canonicalVariantId === "string" ? body.canonicalVariantId : undefined
    });
    return Response.json({ appointment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "appointments_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

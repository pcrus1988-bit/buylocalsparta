import { requireAccountSession } from "../../../../../lib/account-session";
import { createCustomerNotification, submitCustomerPrivacyExport } from "../../../../../lib/customer-state-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const now = Date.now();
    const item = await submitCustomerPrivacyExport({ userId: principal.userId, now });
    await createCustomerNotification({ userId: principal.userId, eventType: "privacy.export_requested", title: "Λάβαμε το αίτημα εξαγωγής", body: "Το αίτημα δεδομένων καταχωρήθηκε και εμφανίζεται στην ενότητα ιδιωτικότητας.", dedupeKey: `privacy-export:${item.id}`, now });
    return Response.json({ request: item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "privacy_export_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

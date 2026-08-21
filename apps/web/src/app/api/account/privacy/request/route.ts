import { requireAccountSession } from "../../../../../lib/account-session";
import { createCustomerNotification } from "../../../../../lib/customer-state-runtime";
import { isCustomerPrivacyRequestType, submitCustomerPrivacyRequest } from "../../../../../lib/customer-privacy-request-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const raw = await request.json().catch(() => null) as { type?: unknown; note?: unknown } | null;
    if (!raw || !isCustomerPrivacyRequestType(raw.type)) {
      return Response.json({ error: "invalid_privacy_request_type" }, { status: 400 });
    }
    const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 2000) : "";
    const now = Date.now();
    const item = await submitCustomerPrivacyRequest({
      userId: principal.userId,
      type: raw.type,
      now,
      details: note ? { note } : undefined
    });
    await createCustomerNotification({
      userId: principal.userId,
      eventType: `privacy.${raw.type}_requested`,
      title: "Λάβαμε το αίτημα ιδιωτικότητας",
      body: `Το αίτημα ${privacyRequestLabel(raw.type)} καταχωρήθηκε και εμφανίζεται στο Privacy & Data Centre.`,
      payload: { privacyRequestId: item.id, privacyRequestType: raw.type },
      dedupeKey: `privacy-request:${item.id}`,
      now
    });
    return Response.json({ request: item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "privacy_request_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

function privacyRequestLabel(type: string): string {
  switch (type) {
    case "access": return "πρόσβασης";
    case "export": return "εξαγωγής / φορητότητας";
    case "correction": return "διόρθωσης";
    case "deletion": return "διαγραφής";
    case "objection": return "εναντίωσης";
    case "marketing_withdrawal": return "ανάκλησης marketing";
    case "account_closure": return "κλεισίματος λογαριασμού";
    default: return "ιδιωτικότητας";
  }
}

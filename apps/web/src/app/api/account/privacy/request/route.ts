import { requireAccountSession } from "../../../../../lib/account-session";
import { createCustomerNotification } from "../../../../../lib/customer-state-runtime";
import { isCustomerPrivacyRequestType, submitCustomerPrivacyRequest } from "../../../../../lib/customer-privacy-request-service";
import { customerBrowserPrivacyRequest } from "../../../../../lib/customer-account-browser-view";
import { ensureCustomerPrivacySupportCase } from "../../../../../lib/customer-support-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const raw = await request.json().catch(() => null) as { type?: unknown; note?: unknown; correction?: unknown } | null;
    if (!raw || !isCustomerPrivacyRequestType(raw.type)) {
      return Response.json({ error: "invalid_privacy_request_type" }, { status: 400 });
    }
    const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 2000) : "";
    const correctionRaw = raw.correction && typeof raw.correction === "object" && !Array.isArray(raw.correction) ? raw.correction as Record<string, unknown> : {};
    const correction = raw.type === "correction" ? {
      firstName: typeof correctionRaw.firstName === "string" ? correctionRaw.firstName.trim().slice(0, 120) : undefined,
      lastName: typeof correctionRaw.lastName === "string" ? correctionRaw.lastName.trim().slice(0, 120) : undefined,
      phone: typeof correctionRaw.phone === "string" ? correctionRaw.phone.trim().slice(0, 40) : undefined,
      preferredLocale: correctionRaw.preferredLocale === "el" || correctionRaw.preferredLocale === "en" ? correctionRaw.preferredLocale : undefined
    } : undefined;
    const hasCorrection = Boolean(correction && Object.values(correction).some((value) => typeof value === "string" && value.length > 0));
    const now = Date.now();
    const item = await submitCustomerPrivacyRequest({
      userId: principal.userId,
      type: raw.type,
      now,
      details: note || hasCorrection ? { ...(note ? { note } : {}), ...(hasCorrection ? { correction } : {}) } : undefined
    });
    await ensureCustomerPrivacySupportCase(principal, {
      privacyRequestId: item.id,
      privacyRequestType: raw.type,
      note: note || undefined,
      now
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
    return Response.json({ request: customerBrowserPrivacyRequest(item) }, { status: 201 });
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
    case "restriction": return "περιορισμού επεξεργασίας";
    case "objection": return "εναντίωσης";
    case "marketing_withdrawal": return "ανάκλησης marketing";
    case "account_closure": return "κλεισίματος λογαριασμού";
    default: return "ιδιωτικότητας";
  }
}

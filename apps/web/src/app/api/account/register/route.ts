import {
  consumeCustomerRegistrationRateLimit,
  customerRegistrationReadiness,
  registerCustomer,
  sendCustomerVerificationEmail
} from "../../../../lib/customer-registration-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const readiness = customerRegistrationReadiness();
  if (!readiness.ready) {
    return Response.json({ code: "registration_unavailable", error: readiness.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) {
    return Response.json({ code: "visitor_required", error: "Trusted visitor identity is required" }, { status: 400 });
  }

  const now = Date.now();
  const decision = await consumeCustomerRegistrationRateLimit({ visitorKey, now });
  if (!decision.allowed) {
    return Response.json(
      { code: "rate_limited", error: "Πάρα πολλές προσπάθειες εγγραφής. Δοκίμασε ξανά αργότερα.", retryAfterMs: decision.retryAfterMs },
      { status: 429, headers: { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)), "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json() as {
      email?: unknown;
      password?: unknown;
      passwordConfirmation?: unknown;
      acceptedPrivacy?: unknown;
      next?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const passwordConfirmation = typeof body.passwordConfirmation === "string" ? body.passwordConfirmation : "";
    const next = typeof body.next === "string" ? body.next : undefined;

    if (!email || !password) throw new Error("Συμπλήρωσε email και κωδικό.");
    if (password !== password.trim()) throw new Error("Ο κωδικός δεν μπορεί να αρχίζει ή να τελειώνει με κενό.");
    if (password !== passwordConfirmation) throw new Error("Οι δύο κωδικοί δεν ταιριάζουν.");
    if (body.acceptedPrivacy !== true) throw new Error("Χρειάζεται να αποδεχτείς την επεξεργασία δεδομένων για τη δημιουργία λογαριασμού.");

    const result = await registerCustomer({ email, password, now });
    try {
      const delivery = await sendCustomerVerificationEmail({
        userId: result.account.id,
        email: result.account.email,
        token: result.verificationToken,
        next,
        now
      });
      return Response.json(
        {
          status: "verification_required",
          email: result.account.email,
          resent: result.resent,
          ...(process.env.NODE_ENV !== "production" && delivery.verificationUrl ? { verificationUrl: delivery.verificationUrl } : {})
        },
        { status: result.resent ? 200 : 201, headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      return Response.json(
        {
          code: "verification_delivery_failed",
          error: "Ο λογαριασμός αποθηκεύτηκε, αλλά δεν στάλθηκε το email επιβεβαίωσης. Υπέβαλε ξανά την ίδια φόρμα για νέα προσπάθεια αποστολής.",
          pending: true,
          email: result.account.email
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Η εγγραφή απέτυχε.";
    const conflict = message === "Email address is already registered";
    return Response.json(
      { code: conflict ? "email_registered" : "registration_invalid", error: conflict ? "Υπάρχει ήδη λογαριασμός με αυτό το email." : message },
      { status: conflict ? 409 : 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

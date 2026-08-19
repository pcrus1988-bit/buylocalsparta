import {
  consumeCustomerPasswordResetRateLimit,
  passwordResetEmailHash,
  requestCustomerPasswordReset
} from "../../../../../lib/customer-password-reset-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) {
    return Response.json({ error: "Trusted visitor identity is required" }, { status: 400 });
  }

  const now = Date.now();
  const decision = await consumeCustomerPasswordResetRateLimit({ visitorKey, now });
  if (!decision.allowed) {
    return Response.json(
      { error: "Πάρα πολλά αιτήματα επαναφοράς. Δοκίμασε ξανά αργότερα.", retryAfterMs: decision.retryAfterMs },
      { status: 429, headers: { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)), "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json() as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) throw new Error("Συμπλήρωσε το email σου.");
    try {
      const result = await requestCustomerPasswordReset({ email, now });
      return Response.json(
        {
          accepted: true,
          message: "Αν υπάρχει ενεργός λογαριασμός με αυτό το email, θα λάβεις σύνδεσμο επαναφοράς.",
          ...(process.env.NODE_ENV !== "production" && result.resetUrl ? { resetUrl: result.resetUrl } : {})
        },
        { status: 202, headers: { "Cache-Control": "no-store" } }
      );
    } catch (deliveryError) {
      console.error(JSON.stringify({
        level: "error",
        event: "auth.customer.password_reset_delivery_failed",
        emailHash: passwordResetEmailHash(email),
        message: deliveryError instanceof Error ? deliveryError.message : String(deliveryError)
      }));
      // Keep the same public response to avoid account enumeration and provider leakage.
      return Response.json(
        { accepted: true, message: "Αν υπάρχει ενεργός λογαριασμός με αυτό το email, θα λάβεις σύνδεσμο επαναφοράς." },
        { status: 202, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Το αίτημα επαναφοράς απέτυχε." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

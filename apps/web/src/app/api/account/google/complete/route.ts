import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../../lib/account-runtime";
import { createOrLinkGoogleCustomer } from "../../../../../lib/google-customer-runtime";
import { GOOGLE_PENDING_COOKIE, readPendingGoogleCookie, safeAccountNext } from "../../../../../lib/google-oauth";
import { saveRegisteredCustomerName } from "../../../../../lib/customer-profile-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const store = await cookies();
  try {
    const pending = readPendingGoogleCookie(store.get(GOOGLE_PENDING_COOKIE)?.value);
    const body = await request.json() as {
      fullName?: unknown;
      acceptedTerms?: unknown;
      acceptedPrivacy?: unknown;
    };
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
    if (fullName.split(" ").filter(Boolean).length < 2) throw new Error("Συμπλήρωσε το πλήρες ονοματεπώνυμό σου.");
    if (fullName.length > 160) throw new Error("Το ονοματεπώνυμο είναι πολύ μεγάλο.");
    if (body.acceptedTerms !== true) throw new Error("Χρειάζεται να αποδεχτείς τους Όρους Χρήσης.");
    if (body.acceptedPrivacy !== true) throw new Error("Χρειάζεται να αποδεχτείς την Πολιτική Απορρήτου.");

    const now = Date.now();
    const session = await createOrLinkGoogleCustomer({ subject: pending.subject, email: pending.email, now });
    await saveRegisteredCustomerName({ userId: session.userId, fullName, now });
    store.delete(GOOGLE_PENDING_COOKIE);
    store.set({
      name: ACCOUNT_SESSION_COOKIE,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
      path: "/",
      expires: new Date(session.expiresAt)
    });
    return Response.json({ authenticated: true, next: safeAccountNext(pending.next) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Η εγγραφή με Google απέτυχε.";
    const expired = message.includes("pending_expired") || message.includes("pending_missing") || message.includes("pending_invalid");
    if (expired) store.delete(GOOGLE_PENDING_COOKIE);
    return Response.json(
      { code: expired ? "google_registration_expired" : "google_registration_failed", error: expired ? "Η σύνδεση με Google έληξε. Δοκίμασε ξανά." : message },
      { status: expired ? 401 : 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

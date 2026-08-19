import { consumeCustomerPasswordReset } from "../../../../../lib/customer-password-reset-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown; passwordConfirmation?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    const passwordConfirmation = typeof body.passwordConfirmation === "string" ? body.passwordConfirmation : "";
    if (!token || !password) throw new Error("Ο σύνδεσμος και ο νέος κωδικός είναι υποχρεωτικά.");
    if (password !== passwordConfirmation) throw new Error("Οι δύο κωδικοί δεν ταιριάζουν.");

    const result = await consumeCustomerPasswordReset({ token, password, now: Date.now() });
    const vendorActivation = result.purpose === "vendor_activation";
    return Response.json(
      {
        reset: true,
        purpose: result.purpose,
        next: vendorActivation ? "/vendor/login?activated=1" : "/login?reset=1",
        message: vendorActivation
          ? "Ο vendor λογαριασμός ενεργοποιήθηκε και ο κωδικός δημιουργήθηκε. Μπορείτε τώρα να συνδεθείτε στο Vendor Workspace."
          : "Ο κωδικός άλλαξε. Μπορείς τώρα να συνδεθείς με τον νέο κωδικό."
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Η επαναφορά κωδικού απέτυχε." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

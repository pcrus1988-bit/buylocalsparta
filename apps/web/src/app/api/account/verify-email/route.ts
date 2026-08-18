import { verifyCustomerEmail } from "../../../../lib/customer-registration-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 512) throw new Error("Ο σύνδεσμος επιβεβαίωσης δεν είναι έγκυρος.");
    await verifyCustomerEmail({ token, now: Date.now() });
    return Response.json({ status: "verified" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { code: "verification_invalid", error: "Ο σύνδεσμος επιβεβαίωσης δεν είναι έγκυρος ή έχει λήξει." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

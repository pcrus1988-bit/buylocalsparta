import { confirmCustomerEmailChange } from "../../../../../../lib/customer-email-change-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 512) throw new Error("Ο σύνδεσμος αλλαγής email δεν είναι έγκυρος.");
    const result = await confirmCustomerEmailChange({ token, now: Date.now() });
    return Response.json({ status: "confirmed", newEmail: result.newEmail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { code: "email_change_invalid", error: error instanceof Error ? error.message : "Ο σύνδεσμος αλλαγής email δεν είναι έγκυρος ή έχει λήξει." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

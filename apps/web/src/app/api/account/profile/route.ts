import { requireAccountSession } from "../../../../lib/account-session";
import { customerAccountProfile, updateCustomerAccountProfile } from "../../../../lib/customer-account-profile-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json(await customerAccountProfile(principal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "profile_failed" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const profile = await updateCustomerAccountProfile(principal, {
      firstName: requiredString(body.firstName, "Το όνομα"),
      lastName: requiredString(body.lastName, "Το επώνυμο"),
      phone: typeof body.phone === "string" ? body.phone : "",
      preferredLocale: typeof body.preferredLocale === "string" ? body.preferredLocale : "el"
    });
    return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "profile_update_failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} είναι υποχρεωτικό.`);
  return value;
}
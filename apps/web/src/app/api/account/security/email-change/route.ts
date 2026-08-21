import { requireAccountSession } from "../../../../../lib/account-session";
import { cancelCustomerEmailChange, requestCustomerEmailChange } from "../../../../../lib/customer-email-change-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const newEmail = requiredString(body.newEmail, "Νέο email", 320);
    const currentPassword = requiredString(body.currentPassword, "Τρέχων κωδικός", 512, false);
    const result = await requestCustomerEmailChange(principal, { newEmail, currentPassword, now: Date.now() });
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Η αλλαγή email δεν ξεκίνησε." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    return Response.json(await cancelCustomerEmailChange(principal, Date.now()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Το αίτημα αλλαγής email δεν ακυρώθηκε." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

function requiredString(value: unknown, label: string, max: number, trim = true): string {
  if (typeof value !== "string") throw new Error(`${label} είναι υποχρεωτικό.`);
  const normalized = trim ? value.trim() : value;
  if (!normalized) throw new Error(`${label} είναι υποχρεωτικό.`);
  if (normalized.length > max) throw new Error(`${label} είναι πολύ μεγάλο.`);
  return normalized;
}

import { requireAccountSession } from "../../../../lib/account-session";
import { assertCustomerCsrf } from "../../../../lib/customer-state-runtime";
import { customerCheckoutProfile, removeCustomerAddress, saveCustomerAddress } from "../../../../lib/customer-address-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json(await customerCheckoutProfile(principal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "address_profile_failed" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession();
    assertCustomerCsrf(principal, request.headers.get("x-csrf-token") ?? undefined);
    const body = await request.json() as Record<string, unknown>;
    const profile = await saveCustomerAddress(principal, {
      id: optionalString(body.id, 128),
      label: optionalString(body.label, 80),
      fullName: requiredString(body.fullName, "Ονοματεπώνυμο", 160),
      companyName: optionalString(body.companyName, 200),
      vatNumber: optionalString(body.vatNumber, 40),
      line1: requiredString(body.line1, "Διεύθυνση", 240),
      line2: optionalString(body.line2, 240),
      locality: requiredString(body.locality, "Πόλη", 120),
      region: optionalString(body.region, 120),
      postcode: requiredString(body.postcode, "Ταχυδρομικός κώδικας", 16),
      countryCode: optionalString(body.countryCode, 2) ?? "GR",
      phone: optionalString(body.phone, 40),
      isDefaultBilling: body.isDefaultBilling === true,
      isDefaultDelivery: body.isDefaultDelivery === true
    }, Date.now());
    return Response.json(profile, { status: body.id ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "address_save_failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireAccountSession();
    assertCustomerCsrf(principal, request.headers.get("x-csrf-token") ?? undefined);
    const body = await request.json() as Record<string, unknown>;
    const id = requiredString(body.id, "Address id", 128);
    return Response.json(await removeCustomerAddress(principal, id, Date.now()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "address_delete_failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

function requiredString(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${label} είναι υποχρεωτικό.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} είναι υποχρεωτικό.`);
  if (trimmed.length > max) throw new Error(`${label} είναι πολύ μεγάλο.`);
  return trimmed;
}

function optionalString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new Error("Το πεδίο είναι πολύ μεγάλο.");
  return trimmed;
}

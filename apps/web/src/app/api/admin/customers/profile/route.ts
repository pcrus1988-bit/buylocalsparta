import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminUpdateCustomerProfile, CUSTOMER_PROFILE_LOCALES, type CustomerProfileLocale } from "../../../../../lib/admin-customer-profile";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "customer.manage" });
    const body = await request.json() as Record<string, unknown>;
    const preferredLocale = String(body.preferredLocale ?? "") as CustomerProfileLocale;
    if (!CUSTOMER_PROFILE_LOCALES.includes(preferredLocale)) throw new Error("Unsupported customer locale");
    const result = await adminUpdateCustomerProfile(principal, {
      customerId: String(body.customerId ?? ""),
      firstName: typeof body.firstName === "string" ? body.firstName : undefined,
      lastName: typeof body.lastName === "string" ? body.lastName : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      preferredLocale,
      reason: String(body.reason ?? "")
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "customer_profile_update_failed" }, { status: 400 });
  }
}

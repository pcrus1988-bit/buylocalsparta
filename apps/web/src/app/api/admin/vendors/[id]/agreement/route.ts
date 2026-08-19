import { requireAdminSession } from "../../../../../../lib/admin-session";

/**
 * Vendor agreements are governed by the full Finance contract lifecycle:
 * generated PDF → delivery → signed gov.gr upload → gov.gr verification →
 * eligible-for-activation → active. The old shortcut endpoint could create an
 * `active` agreement directly from Admin/Vendors and therefore bypass those
 * controls, so it is intentionally retired.
 */
export async function POST(request: Request) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    return Response.json({
      error: "The legacy vendor agreement shortcut is retired. Use Admin → Finance → Vendor agreements to generate, sign, verify and activate the cooperation agreement."
    }, { status: 409 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_agreement_failed" }, { status: 400 });
  }
}

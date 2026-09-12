import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { requireVendorSession } from "../../../../lib/vendor-session";

export async function GET() {
  try {
    const principal = await requireVendorSession();
    return Response.json({
      csrfToken: principal.csrfToken,
      vendorId: principal.vendorId,
      dropshippingOnly: await isDropshippingOnlyVendor(principal.vendorId),
      account: { email: principal.email, roles: principal.roles }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_auth_context_failed" }, { status: 401 });
  }
}

import { requireAdminSession } from "../../../../../../lib/admin-session";
import { prepareVendorActivationAccess } from "../../../../../../lib/vendor-activation-access";
import { sendVendorActivationEmail } from "../../../../../../lib/vendor-activation-email";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const access = await prepareVendorActivationAccess({ vendorId: id, actorUserId: principal.userId, now: Date.now() });
    await sendVendorActivationEmail(access);
    return Response.json({
      ok: true,
      delivered: true,
      passwordSetupRequired: access.passwordSetupRequired,
      destination: access.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2")
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_access_invite_failed" }, { status: 400 });
  }
}

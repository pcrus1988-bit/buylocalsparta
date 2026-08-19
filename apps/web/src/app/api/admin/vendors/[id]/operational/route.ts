import { requireAdminSession } from "../../../../../../lib/admin-session";
import { setAdminVendorDirectoryVisibility } from "../../../../../../lib/vendor-admin-controls";
import { prepareVendorActivationAccess } from "../../../../../../lib/vendor-activation-access";
import { sendVendorActivationEmail } from "../../../../../../lib/vendor-activation-email";
import { setGovernedAdminVendorOperationalState } from "../../../../../../lib/vendor-onboarding-governance";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { active?: unknown; reason?: unknown };
    if (typeof body.active !== "boolean") throw new Error("Invalid operational state");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Operational-state reason is required");

    const now = Date.now();
    const access = body.active ? await prepareVendorActivationAccess({ vendorId: id, actorUserId: principal.userId, now }) : undefined;
    const result = await setGovernedAdminVendorOperationalState(principal, { vendorId: id, active: body.active, reason: body.reason, now });
    if (body.active) {
      await setAdminVendorDirectoryVisibility(principal, {
        vendorId: id,
        visible: false,
        reason: "Operational activation requires an explicit publication review",
        now
      });
    }

    let notificationWarning: string | undefined;
    let onboardingEmailSent = false;
    if (body.active && result.from !== "active" && access) {
      try {
        await sendVendorActivationEmail(access);
        onboardingEmailSent = true;
      } catch (emailError) {
        notificationWarning = emailError instanceof Error ? emailError.message : "Vendor activation email could not be sent";
        console.error(JSON.stringify({
          level: "error",
          event: "vendor.activation_email_failed",
          vendorId: result.vendorId,
          message: notificationWarning
        }));
      }
    }

    return Response.json({ ok: true, result, onboardingEmailSent, notificationWarning });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_operational_state_failed" }, { status: 400 });
  }
}

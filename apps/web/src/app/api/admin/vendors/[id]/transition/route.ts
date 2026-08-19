import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminVendorsWorkspace, transitionVendorApplication } from "../../../../../../lib/admin-runtime";
import { prepareVendorActivationAccess } from "../../../../../../lib/vendor-activation-access";
import { sendVendorActivationEmail } from "../../../../../../lib/vendor-activation-email";
import { sendVendorApplicationStateEmail } from "../../../../../../lib/vendor-email-workflows";
import type { VendorOnboardingState } from "@buy-local-sparta/core";

const allowed = new Set<VendorOnboardingState>(["verification_pending", "catalog_onboarding", "test_ready", "active", "restricted", "suspended", "closed"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf:true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { to?: unknown; reason?: unknown };
    if (typeof body.to !== "string" || !allowed.has(body.to as VendorOnboardingState)) throw new Error("Invalid vendor transition");
    if (typeof body.reason !== "string" || body.reason.trim().length < 3) throw new Error("Transition reason is required");

    const state = body.to as VendorOnboardingState;
    const before = await adminVendorsWorkspace(principal);
    const current = before.applications.find((item) => item.id === id);
    if (current?.state === state) {
      return Response.json({ ...before, idempotent: true });
    }

    const now = Date.now();
    const transition = await transitionVendorApplication(principal, { applicationId: id, to: state, reason: body.reason });

    const workspace = await adminVendorsWorkspace(principal);
    const application = workspace.applications.find((item) => item.id === id) ?? current;
    let notificationWarning: string | undefined;
    let onboardingEmailSent = false;

    if (state === "active" && transition.vendorId) {
      try {
        const access = await prepareVendorActivationAccess({ vendorId: transition.vendorId, actorUserId: principal.userId, now });
        await sendVendorActivationEmail(access);
        onboardingEmailSent = true;
      } catch (emailError) {
        notificationWarning = emailError instanceof Error ? emailError.message : "Vendor activation email could not be sent";
        console.error(JSON.stringify({
          level: "error",
          event: "vendor.activation_email_failed",
          applicationId: id,
          vendorId: transition.vendorId,
          message: notificationWarning
        }));
      }
    } else if (application?.contactEmail) {
      try {
        const delivery = await sendVendorApplicationStateEmail({
          to: application.contactEmail,
          tradingName: application.tradingName,
          applicationId: application.id,
          state,
          reason: body.reason
        });
        if (!delivery.sent) notificationWarning = "Vendor notification email was not delivered. Check Resend/email configuration.";
      } catch (emailError) {
        notificationWarning = emailError instanceof Error ? emailError.message : "Vendor notification could not be sent";
      }
      if (notificationWarning) {
        console.error(JSON.stringify({
          level: "error",
          event: "vendor.application_notification_failed",
          applicationId: id,
          state,
          message: notificationWarning
        }));
      }
    }
    return Response.json({ ...workspace, onboardingEmailSent, notificationWarning });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_transition_failed" }, { status: 400 });
  }
}

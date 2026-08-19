import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminVendorsWorkspace, transitionVendorApplication } from "../../../../../../lib/admin-runtime";
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
    await transitionVendorApplication(principal, { applicationId: id, to: state, reason: body.reason });

    const workspace = await adminVendorsWorkspace(principal);
    const application = workspace.applications.find((item) => item.id === id);
    let notificationWarning: string | undefined;
    if (application?.contactEmail) {
      try {
        await sendVendorApplicationStateEmail({
          to: application.contactEmail,
          tradingName: application.tradingName,
          applicationId: application.id,
          state,
          reason: body.reason
        });
      } catch (emailError) {
        // The governed database transition has already committed. A notification
        // transport problem must not make the Admin UI report the transition as
        // failed and tempt the operator into submitting the same transition twice.
        notificationWarning = emailError instanceof Error ? emailError.message : "Vendor notification could not be sent";
        console.error(JSON.stringify({
          level: "error",
          event: "vendor.application_notification_failed",
          applicationId: id,
          state,
          message: notificationWarning
        }));
      }
    }
    return Response.json({ ...workspace, notificationWarning });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_transition_failed" }, { status: 400 });
  }
}

import { requireAdminSession } from "../../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../../lib/admin-runtime";
import { prepareHubClaimPasswordReset } from "../../../../../../lib/vendor-activation-access";
import { sendVendorPasswordResetEmail } from "../../../../../../lib/vendor-activation-email";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character reason is required");
    const access = await prepareHubClaimPasswordReset({ claimId: id, actorUserId: principal.userId, now: Date.now() });
    await sendVendorPasswordResetEmail(access, { claim: true });
    await recordAdminAudit(principal, "hub_claim.owner_password_reset_sent", "hub_prospect", id, reason, { recipientUserId: access.userId });
    return Response.json({ ok: true, delivered: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CLAIM_PASSWORD_RESET_FAILED";
    return Response.json({ error: code }, { status: code === "ADMIN_AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

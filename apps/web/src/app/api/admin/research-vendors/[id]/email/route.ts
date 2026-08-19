import { requireAdminSession } from "../../../../../../lib/admin-session";
import { researchVendorDossier } from "../../../../../../lib/research-vendors-runtime";
import { sendResearchVendorInvitationEmail } from "../../../../../../lib/vendor-email-workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const data = await researchVendorDossier(principal, decodeURIComponent(id));
    if (!data.databaseConfigured) return Response.json({ error: "Production vendor research is unavailable" }, { status: 503 });
    if (!data.vendor) return Response.json({ error: "Research vendor not found" }, { status: 404 });
    if (!data.vendor.email) return Response.json({ error: "This research vendor has no email address" }, { status: 409 });

    const result = await sendResearchVendorInvitationEmail({
      to: data.vendor.email,
      tradingName: data.vendor.tradingName,
      researchId: data.vendor.id
    });
    if (!result.sent) return Response.json({ error: "Email delivery is not configured or Resend rejected the message" }, { status: 503 });
    return Response.json({ status: "sent", providerMessageId: result.providerMessageId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_email_failed" }, { status: 400 });
  }
}

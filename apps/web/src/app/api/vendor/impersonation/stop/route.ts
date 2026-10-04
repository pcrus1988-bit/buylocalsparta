import { cookies } from "next/headers";
import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import { ADMIN_VENDOR_IMPERSONATION_COOKIE } from "../../../../../lib/vendor-impersonation";
import { getVendorImpersonationSession, requireVendorSession } from "../../../../../lib/vendor-session";

export async function POST(request: Request) {
  try {
    await requireVendorSession(request, true);
    const impersonation = await getVendorImpersonationSession();
    if (!impersonation) throw new Error("VENDOR_IMPERSONATION_REQUIRED");

    (await cookies()).set({
      name: ADMIN_VENDOR_IMPERSONATION_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
      path: "/",
      expires: new Date(0)
    });

    await recordAdminAudit(
      impersonation.admin,
      "vendor.impersonation.ended",
      "vendor",
      impersonation.vendorId,
      "Admin exited vendor impersonation"
    );

    return Response.json({
      ok: true,
      redirectTo: `/admin/partners/${encodeURIComponent(impersonation.vendorId)}`
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "vendor_impersonation_stop_failed" },
      { status: 400 }
    );
  }
}

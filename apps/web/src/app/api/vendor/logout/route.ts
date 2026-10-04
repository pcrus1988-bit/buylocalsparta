import { cookies } from "next/headers";
import { recordAdminAudit } from "../../../../lib/admin-runtime";
import { ADMIN_VENDOR_IMPERSONATION_COOKIE } from "../../../../lib/vendor-impersonation";
import { getVendorImpersonationSession, requireVendorSession } from "../../../../lib/vendor-session";
import { logoutVendor, VENDOR_SESSION_COOKIE } from "../../../../lib/vendor-runtime";
import { VENDOR_TRIAL_COOKIE } from "../../../../lib/vendor-trial-runtime";

export async function POST(request: Request) {
  try {
    await requireVendorSession(request, true);
    const impersonation = await getVendorImpersonationSession();
    const store = await cookies();
    const secure = process.env.NODE_ENV === "production" || request.url.startsWith("https://");

    if (impersonation) {
      store.set({ name: ADMIN_VENDOR_IMPERSONATION_COOKIE, value: "", httpOnly: true, sameSite: "strict", secure, path: "/", expires: new Date(0) });
      await recordAdminAudit(
        impersonation.admin,
        "vendor.impersonation.ended",
        "vendor",
        impersonation.vendorId,
        "Admin exited vendor impersonation through vendor logout"
      );
      return Response.json({ ok: true, redirectTo: `/admin/partners/${encodeURIComponent(impersonation.vendorId)}` });
    }

    await logoutVendor(store.get(VENDOR_SESSION_COOKIE)?.value);
    store.set({ name: VENDOR_SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(0) });
    store.set({ name: VENDOR_TRIAL_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(0) });
    return Response.json({ ok: true, redirectTo: "/vendor/login" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_logout_failed" }, { status: 400 });
  }
}

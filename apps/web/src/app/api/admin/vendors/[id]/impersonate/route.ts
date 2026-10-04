import { cookies } from "next/headers";
import { requireAdminSession } from "../../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../../lib/admin-runtime";
import {
  ADMIN_VENDOR_IMPERSONATION_COOKIE,
  createVendorImpersonation
} from "../../../../../../lib/vendor-impersonation";
import { adminVendorShopsWorkspace } from "../../../../../../lib/vendor-admin-controls";
import { VENDOR_SESSION_COOKIE } from "../../../../../../lib/vendor-runtime";
import { VENDOR_TRIAL_COOKIE } from "../../../../../../lib/vendor-trial-runtime";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminSession(request, { csrf: true });
    if (!admin.roles.includes("super_admin")) throw new Error("SUPER_ADMIN_REQUIRED");

    const vendorId = decodeURIComponent((await params).id).trim();
    const body = await request.json().catch(() => ({})) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3 || reason.length > 240) throw new Error("A short impersonation reason is required");

    const managed = await adminVendorShopsWorkspace(admin);
    const vendor = managed.shops.find((shop) => shop.id === vendorId);
    if (!vendor || vendor.researchVendor) throw new Error("Vendor dashboard is not available for this record");

    const now = Date.now();
    const impersonation = createVendorImpersonation(admin, vendor.id, now);
    const store = await cookies();
    const secure = process.env.NODE_ENV === "production" || request.url.startsWith("https://");

    store.set({
      name: ADMIN_VENDOR_IMPERSONATION_COOKIE,
      value: impersonation.token,
      httpOnly: true,
      sameSite: "strict",
      secure,
      path: "/",
      expires: new Date(impersonation.expiresAt)
    });

    // Remove any unrelated vendor/trial browser state so the admin-selected vendor
    // always wins deterministically and cannot inherit another account's session.
    store.set({ name: VENDOR_SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(0) });
    store.set({ name: VENDOR_TRIAL_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure, path: "/", expires: new Date(0) });

    await recordAdminAudit(
      admin,
      "vendor.impersonation.started",
      "vendor",
      vendor.id,
      reason,
      {
        vendorName: vendor.tradingName,
        impersonatedRole: "vendor_owner",
        expiresAt: impersonation.expiresAt
      }
    );

    return Response.json({
      ok: true,
      vendorId: vendor.id,
      expiresAt: new Date(impersonation.expiresAt).toISOString(),
      redirectTo: "/vendor"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_impersonation_failed";
    const status = message === "SUPER_ADMIN_REQUIRED" || message.includes("permission") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}

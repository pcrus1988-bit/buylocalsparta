import { cookies } from "next/headers";
import { requireVendorSession } from "../../../../lib/vendor-session";
import { logoutVendor, VENDOR_SESSION_COOKIE } from "../../../../lib/vendor-runtime";

export async function POST(request: Request) {
  try {
    await requireVendorSession(request, true);
    const store = await cookies();
    await logoutVendor(store.get(VENDOR_SESSION_COOKIE)?.value);
    store.set({ name: VENDOR_SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"), path: "/", expires: new Date(0) });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_logout_failed" }, { status: 400 });
  }
}

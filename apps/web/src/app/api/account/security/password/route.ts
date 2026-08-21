import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../../lib/account-runtime";
import { requireAccountSession } from "../../../../../lib/account-session";
import { changeCustomerPassword } from "../../../../../lib/customer-account-profile-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (newPassword !== confirmPassword) throw new Error("Οι δύο νέοι κωδικοί δεν ταιριάζουν.");
    await changeCustomerPassword(principal, { currentPassword, newPassword });
    const store = await cookies();
    store.set({ name: ACCOUNT_SESSION_COOKIE, value: "", path: "/", expires: new Date(0), httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "password_change_failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
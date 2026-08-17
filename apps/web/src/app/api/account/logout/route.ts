import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../lib/account-runtime";
import { logoutCustomer } from "../../../../lib/customer-state-runtime";

export async function POST() {
  try {
    const store = await cookies();
    const token = store.get(ACCOUNT_SESSION_COOKIE)?.value;
    await logoutCustomer(token);
    store.set({ name: ACCOUNT_SESSION_COOKIE, value: "", path: "/", expires: new Date(0), httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "logout_failed" }, { status: 400 });
  }
}

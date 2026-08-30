import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../../lib/account-runtime";
import { authenticateExistingGoogleCustomer } from "../../../../../lib/google-customer-runtime";
import {
  createPendingGoogleCookie,
  exchangeGoogleAuthorizationCode,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_PENDING_COOKIE,
  readGoogleFlowCookie,
  safeAccountNext
} from "../../../../../lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const store = await cookies();
  const flowCookie = store.get(GOOGLE_FLOW_COOKIE)?.value;
  try {
    if (requestUrl.searchParams.get("error")) throw new Error("google_authorization_cancelled");
    const code = requestUrl.searchParams.get("code");
    if (!code) throw new Error("google_code_missing");
    const flow = readGoogleFlowCookie(flowCookie, requestUrl.searchParams.get("state"));
    const identity = await exchangeGoogleAuthorizationCode({ code, flow });
    const session = await authenticateExistingGoogleCustomer({ subject: identity.subject, email: identity.email, now: Date.now() });
    store.delete(GOOGLE_FLOW_COOKIE);

    if (session) {
      store.delete(GOOGLE_PENDING_COOKIE);
      store.set({
        name: ACCOUNT_SESSION_COOKIE,
        value: session.token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
        path: "/",
        expires: new Date(session.expiresAt)
      });
      return Response.redirect(new URL(safeAccountNext(flow.next), request.url), 302);
    }

    const pending = createPendingGoogleCookie(identity, flow.next);
    store.set({
      name: GOOGLE_PENDING_COOKIE,
      value: pending.value,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
      path: "/",
      expires: new Date(pending.expiresAt)
    });
    const register = new URL("/register", request.url);
    register.searchParams.set("google", "1");
    if (safeAccountNext(flow.next) !== "/account") register.searchParams.set("next", safeAccountNext(flow.next));
    return Response.redirect(register, 302);
  } catch (error) {
    store.delete(GOOGLE_FLOW_COOKIE);
    const login = new URL("/login", request.url);
    login.searchParams.set("googleError", error instanceof Error && error.message === "google_authorization_cancelled" ? "cancelled" : "failed");
    return Response.redirect(login, 302);
  }
}

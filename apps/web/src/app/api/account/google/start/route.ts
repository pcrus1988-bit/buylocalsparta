import { cookies } from "next/headers";
import { beginGoogleOAuth, GOOGLE_FLOW_COOKIE } from "../../../../../lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const flow = beginGoogleOAuth(request, url.searchParams.get("next"));
    const store = await cookies();
    store.set({
      name: GOOGLE_FLOW_COOKIE,
      value: flow.cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
      path: "/api/account/google",
      expires: new Date(flow.expiresAt)
    });
    return Response.redirect(flow.authorizationUrl, 302);
  } catch {
    const destination = new URL("/login", request.url);
    destination.searchParams.set("googleError", "unavailable");
    return Response.redirect(destination, 302);
  }
}

import { cookies } from "next/headers";
import { ACCOUNT_SESSION_COOKIE } from "../../../../lib/account-runtime";
import { authenticateCustomer, consumeCustomerLoginRateLimit } from "../../../../lib/customer-state-runtime";

export async function POST(request: Request) {
  try {
    const visitorKey = request.headers.get("x-bls-visitor")?.trim();
    if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) return Response.json({ error: "Trusted visitor identity is required" }, { status: 400 });
    const now = Date.now();
    const decision = await consumeCustomerLoginRateLimit({ visitorKey, now });
    if (!decision.allowed) return Response.json({ error: "Too many login attempts", retryAfterMs: decision.retryAfterMs }, { status: 429, headers: { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)) } });
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) throw new Error("Email and password are required");
    const result = await authenticateCustomer({ email, password, now });
    const store = await cookies();
    store.set({
      name: ACCOUNT_SESSION_COOKIE,
      value: result.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
      path: "/",
      expires: new Date(result.expiresAt)
    });
    return Response.json({ authenticated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "login_failed" }, { status: 401 });
  }
}

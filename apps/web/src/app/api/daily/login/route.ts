import { cookies } from "next/headers";
import { authenticateDaily, DAILY_SESSION_COOKIE } from "../../../../lib/daily-runtime";
import { authenticateVendor, consumeVendorLoginLimit, VENDOR_SESSION_COOKIE } from "../../../../lib/vendor-runtime";

export async function POST(request: Request) {
  try {
    const visitorKey = request.headers.get("x-bls-visitor")?.trim();
    if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) return Response.json({ error: "Trusted visitor identity is required" }, { status: 400 });
    const now = Date.now();
    const decision = await consumeVendorLoginLimit(`daily:${visitorKey}`, now);
    if (!decision.allowed) return Response.json({ error: "Too many login attempts", retryAfterMs: decision.retryAfterMs }, { status: 429, headers: { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)) } });
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) throw new Error("Email and password are required");

    const store = await cookies();
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
      path: "/"
    };

    try {
      const result = await authenticateDaily({ email, password, now });
      store.delete(VENDOR_SESSION_COOKIE);
      store.set({ name: DAILY_SESSION_COOKIE, value: result.token, ...cookieOptions, expires: new Date(result.expiresAt) });
      return Response.json({ kind: "daily", vendorId: result.principal.vendorId, email: result.principal.email, displayName: result.displayName, csrfToken: result.principal.csrfToken });
    } catch {
      const result = await authenticateVendor({ email, password, now });
      if (!result.principal.vendorId || !result.principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("Daily access is not enabled for this account");
      store.delete(DAILY_SESSION_COOKIE);
      store.set({ name: VENDOR_SESSION_COOKIE, value: result.token, ...cookieOptions, expires: new Date(result.expiresAt) });
      return Response.json({ kind: "vendor", vendorId: result.principal.vendorId, email: result.principal.email, csrfToken: result.principal.csrfToken });
    }
  } catch {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
}

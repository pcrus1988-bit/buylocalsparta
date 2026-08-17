import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, authenticateAdmin, consumeAdminLoginLimit, isPlatformRole, recordAdminAudit, recordAdminSecurityEvent } from "../../../../lib/admin-runtime";

export async function POST(request: Request) {
  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  try {
    if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) return Response.json({ error: "Trusted visitor identity is required" }, { status: 400 });
    const now = Date.now();
    const decision = await consumeAdminLoginLimit(visitorKey, now);
    if (!decision.allowed) {
      await recordAdminSecurityEvent({ type: "rate_limit.exceeded", severity: "medium", route: "/api/admin/login", method: "POST", subjectHash: hash(visitorKey), occurredAt: now });
      return Response.json({ error: "Too many login attempts", retryAfterMs: decision.retryAfterMs }, { status: 429, headers: { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)) } });
    }
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) throw new Error("Email and password are required");
    const result = await authenticateAdmin({ email, password, now });
    if (result.principal.vendorId || !result.principal.roles.some(isPlatformRole)) throw new Error("Platform access is not enabled for this account");
    (await cookies()).set({ name: ADMIN_SESSION_COOKIE, value: result.token, httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"), path: "/", expires: new Date(result.expiresAt) });
    await recordAdminAudit(result.principal, "admin.login", "session", result.principal.sessionId);
    return Response.json({ email: result.principal.email, roles: result.principal.roles, csrfToken: result.principal.csrfToken });
  } catch (error) {
    const subject = visitorKey || "unknown";
    await recordAdminSecurityEvent({ type: "auth.login_failed", severity: "medium", route: "/api/admin/login", method: "POST", subjectHash: hash(subject), details: { reason: error instanceof Error ? error.message : "login_failed" }, occurredAt: Date.now() }).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "admin_login_failed" }, { status: 401 });
  }
}
function hash(value:string){return createHash("sha256").update(`bls-admin-login|${value}`).digest("hex")}

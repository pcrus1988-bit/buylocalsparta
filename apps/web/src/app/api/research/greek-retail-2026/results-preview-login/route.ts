import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeAdminLoginLimit, recordAdminSecurityEvent } from "../../../../../lib/admin-runtime";
import {
  RESEARCH_PREVIEW_COOKIE, RESEARCH_PREVIEW_LOGIN_PATH, RESEARCH_PREVIEW_PATH,
  RESEARCH_PREVIEW_TTL_MS, createResearchPreviewTicket,
  researchPreviewConfigured, validResearchPreviewCredentials
} from "../../../../../lib/research-preview-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(request: Request, code: string): NextResponse {
  const url = new URL(RESEARCH_PREVIEW_LOGIN_PATH, request.url);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: Request) {
  // Plain HTML form, with same-origin validation to prevent login CSRF.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")
      && !request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return new Response("Unsupported media type", { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new Response("Invalid request", { status: 413 });
  if (!researchPreviewConfigured()) return fail(request, "unavailable");

  const forwardingIp = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for") || "unknown";
  const visitorKey = createHash("sha256")
    .update("research-preview-login|").update(forwardingIp.split(",")[0].trim().slice(0, 128))
    .digest("hex");
  const now = Date.now();
  try {
    // Postgres-backed fixed-window throttle; don't trust in-memory serverless counters.
    const limit = await consumeAdminLoginLimit(visitorKey, now);
    if (!limit.allowed) return fail(request, "invalid");
    const form = await request.formData();
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string"
        || email.length > 254 || password.length > 200
        || !validResearchPreviewCredentials(email, password)) {
      await recordAdminSecurityEvent({
        type: "auth.login_failed", severity: "medium",
        route: "/api/research/greek-retail-2026/results-preview-login", method: "POST",
        subjectHash: visitorKey, occurredAt: now,
        details: { reason: "research_preview_credentials_invalid" }
      }).catch(() => undefined);
      return fail(request, "invalid");
    }
    const ticket = createResearchPreviewTicket(now);
    const response = NextResponse.redirect(new URL(RESEARCH_PREVIEW_PATH, request.url), 303);
    response.cookies.set({
      name: RESEARCH_PREVIEW_COOKIE, value: ticket.token,
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", path: "/", maxAge: RESEARCH_PREVIEW_TTL_MS / 1000,
      expires: new Date(ticket.expiresAt)
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return fail(request, "unavailable");
  }
}

import { createHash, randomUUID } from "node:crypto";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";
import { sendTransactionalEmail, transactionalEmailConfigured } from "../../../../../lib/transactional-email";
import { ResearchDataAccessInputError, validateResearchDataAccessInquiry } from "../../../../../lib/research-data-access-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const response = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const state = globalThis as typeof globalThis & {
  __researchDataAccessLimiter?: PostgresFixedWindowRateLimiter;
};
const limiter = () => state.__researchDataAccessLimiter ??=
  new PostgresFixedWindowRateLimiter(getProductionPostgresRuntime().sqlPool);

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Public intake only. There is deliberately no dataset read or approval endpoint here. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return response({ code: "origin_not_allowed" }, 403);
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return response({ code: "invalid_content_type" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 6000) {
    return response({ code: "invalid_payload" }, 413);
  }
  if (!productionDatabaseConfigured() || !transactionalEmailConfigured()) {
    return response({ code: "service_unavailable", error: "Η υποβολή δεν είναι προσωρινά διαθέσιμη." }, 503);
  }
  try {
    const raw = await request.text();
    if (raw.length > 6000) return response({ code: "invalid_payload" }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return response({ code: "invalid_payload" }, 400); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return response({ code: "invalid_payload" }, 400);
    }
    const body = parsed as Record<string, unknown>;
    // Hidden honeypot: do not send mail or provide feedback to simple spambots.
    if (typeof body.website === "string" && body.website.trim()) {
      return response({ status: "received" }, 202);
    }
    const inquiry = validateResearchDataAccessInquiry(body);
    // Vercel supplies/overwrites this edge header. Never trust client-provided X-Forwarded-For.
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      (process.env.NODE_ENV !== "production" ? "local-development" : "");
    if (!ip || ip.length > 100) {
      return response({ code: "service_unavailable", error: "Η υποβολή δεν είναι προσωρινά διαθέσιμη." }, 503);
    }
    const now = Date.now();
    const [network, email] = await Promise.all([
      limiter().consume({ route: "research-raw-data-request-ip", key: fingerprint(ip), limit: 8, windowMs: 86400000, now }),
      limiter().consume({ route: "research-raw-data-request-email", key: fingerprint(inquiry.email), limit: 3, windowMs: 86400000, now })
    ]);
    if (!network.allowed || !email.allowed) {
      return response({ code: "rate_limited", error: "Πάρα πολλά αιτήματα. Δοκιμάστε ξανά αύριο." }, 429);
    }

    const requestId = randomUUID();
    await sendTransactionalEmail({
      to: "info@kontamou.site",
      subject: "KONTA MOY Research · Αίτημα πρόσβασης σε ανωνυμοποιημένα δεδομένα",
      text: [
        "Νέο αίτημα πρόσβασης σε ανωνυμοποιημένα μικροδεδομένα.",
        "Μελέτη: Ελληνικό Λιανεμπόριο 2026",
        "Αριθμός αιτήματος: " + requestId,
        "Email ενδιαφερόμενου: " + inquiry.email,
        "",
        "Σκοπός / μήνυμα:",
        inquiry.message,
        "",
        "ΕΝΕΡΓΕΙΑ: Χειροκίνητος έλεγχος του αιτήματος, του σκοπού χρήσης, των ορίων ανωνυμοποίησης και των όρων διάθεσης. Καμία αυτόματη πρόσβαση δεν έχει δοθεί.",
        "Απάντηση στον ενδιαφερόμενο μόνο μετά από έλεγχο: " + inquiry.email,
        "Σελίδα: https://kontamou.site/research/greek-retail-2026/results"
      ].join("\n"),
      eventType: "research.raw_data_access_request",
      idempotencyKey: "research-raw-data-request:" + requestId,
      locale: "el"
    });
    return response({ status: "received" }, 202);
  } catch (error) {
    if (error instanceof ResearchDataAccessInputError) {
      return response({ code: error.code, error: error.message }, 400);
    }
    // Never expose inquiry text, email, database details, or provider errors in logs.
    console.error("research_data_access_request_failed", error instanceof Error ? error.name : "UnknownError");
    return response({ code: "service_unavailable", error: "Δεν στάλθηκε το αίτημα. Παρακαλούμε δοκιμάστε ξανά αργότερα." }, 503);
  }
}

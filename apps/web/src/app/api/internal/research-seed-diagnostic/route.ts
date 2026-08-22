import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

function hiddenNotFound() {
  return NextResponse.json(
    { ok: false, error: "not_found" },
    { status: 404, headers: { "cache-control": PRIVATE_NO_STORE } }
  );
}

function secureTokenMatches(candidate: string | null, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  // Internal research diagnostics are deliberately opt-in in production.
  // Credentials must live in server-side environment variables and must never be committed to source.
  const enabled = process.env.ENABLE_INTERNAL_RESEARCH_DIAGNOSTICS === "true";
  const token = process.env.RESEARCH_SEED_DIAGNOSTIC_TOKEN;
  const upstreamUrl = process.env.RESEARCH_SEED_DIAGNOSTIC_URL;

  if (!enabled || !token || !upstreamUrl) return hiddenNotFound();

  const authorization = request.headers.get("authorization");
  const candidate = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!secureTokenMatches(candidate, token)) return hiddenNotFound();

  let url: URL;
  try {
    url = new URL(upstreamUrl);
  } catch {
    return NextResponse.json(
      { ok: false, error: "diagnostic_not_configured" },
      { status: 503, headers: { "cache-control": PRIVATE_NO_STORE } }
    );
  }

  if (url.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, error: "diagnostic_not_configured" },
      { status: 503, headers: { "cache-control": PRIVATE_NO_STORE } }
    );
  }

  const response = await fetch(url, { cache: "no-store", redirect: "error" });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": PRIVATE_NO_STORE,
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet"
    }
  });
}

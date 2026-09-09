import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_BASE = "https://api.resend.com";
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

async function resendJson(path: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not available in this preview environment");

  const response = await fetch(`${RESEND_API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      "user-agent": "kontamou-resend-recovery/2026-09-09"
    },
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend request failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload as Record<string, unknown>;
}

async function listReceivedEmails() {
  const rows: Array<Record<string, unknown>> = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (after) query.set("after", after);

    const payload = await resendJson(`/emails/receiving?${query.toString()}`);
    const data = Array.isArray(payload.data)
      ? payload.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      : [];

    rows.push(...data);
    if (!payload.has_more || data.length === 0) break;

    const lastId = data[data.length - 1]?.id;
    if (typeof lastId !== "string" || !lastId) break;
    after = lastId;
  }

  return rows;
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === "production") {
    return Response.json({ error: "Recovery endpoint is disabled in production" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();

    if (id) {
      if (!/^[A-Za-z0-9_-]{6,200}$/.test(id)) {
        return Response.json({ error: "Invalid email id" }, { status: 400 });
      }

      const email = await resendJson(`/emails/receiving/${encodeURIComponent(id)}`);
      return Response.json({ ok: true, email }, { headers: { "Cache-Control": "no-store" } });
    }

    const emails = await listReceivedEmails();
    return Response.json(
      { ok: true, count: emails.length, emails },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

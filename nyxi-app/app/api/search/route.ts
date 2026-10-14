import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };
const configuredEndpoint = process.env.NYXI_PUBLIC_SEARCH_URL;
const endpoint = (() => {
  if (!configuredEndpoint) return null;
  try {
    const u = new URL(configuredEndpoint);
    if (u.protocol !== "https:" || u.hostname !== "eemihhfreggbigxejjhj.supabase.co" || u.pathname !== "/functions/v1/nyxi-public-search" || u.search || u.hash || u.username || u.password) return null;
    return u.href;
  } catch { return null; }
})();

function httpsCitation(input: unknown): string | null {
  try {
    const u = new URL(String(input));
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0$|\[::1\]|\[fc|\[fd|\[fe80)/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > 100) return Response.json({ error: "query_too_long" }, { status: 400, headers: noStore });
  if (!q) return Response.json({ status: "idle", query: "", results: [] }, { headers: noStore });
  if (!endpoint) return Response.json({ error: "not_configured" }, { status: 503, headers: noStore });
  try {
    const upstream = await fetch(endpoint + "?q=" + encodeURIComponent(q), { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!upstream.ok) return Response.json({ error: upstream.status === 429 ? "rate_limited" : "unavailable" }, { status: upstream.status === 429 ? 429 : 503, headers: noStore });
    const payload: unknown = await upstream.json();
    if (!payload || typeof payload !== "object") throw new Error("invalid_payload");
    const data = payload as { status?: string; results?: unknown[] };
    if (!["ok", "no_matches", "no_approved_evidence"].includes(data.status || "") || !Array.isArray(data.results)) throw new Error("invalid_schema");
    if (data.status !== "ok" && data.results.length !== 0) throw new Error("inconsistent_publication_state");
    const safe = data.results.slice(0, 8).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      const citationUrl = httpsCitation(row.citation_url);
      const excerpt = typeof row.excerpt === "string" ? row.excerpt.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 650) : "";
      if (!citationUrl || !excerpt) return [];
      return [{ id: String(row.id || ""), type: String(row.type || "fragment"), authority: typeof row.authority === "string" ? row.authority : null, jurisdiction: typeof row.jurisdiction === "string" ? row.jurisdiction : null, category: typeof row.category === "string" ? row.category : null, excerpt, citation_url: citationUrl }];
    });
    return Response.json({ status: data.status === "ok" && safe.length === 0 ? "no_matches" : data.status, query: q, results: safe }, { headers: noStore });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}

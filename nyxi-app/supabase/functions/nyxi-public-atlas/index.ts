/**
 * NYXI public source atlas.
 * Active, public source-level references ONLY. Never serves snapshots,
 * evidence, internal notes, rights records, or unreviewed claims.
 */
const PROJECT = "eemihhfreggbigxejjhj";
const ORIGINS = new Set(["https://nyxi.kontamou.site", "https://nyxi.gr", "https://www.nyxi.gr"]);
const headers = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
  "cache-control": "public, max-age=60, s-maxage=300",
};
const json = (body: unknown, status = 200, cors: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, ...cors } });

function safePublicLink(value: unknown) {
  try {
    const u = new URL(String(value));
    if (u.protocol !== "https:" || u.username || u.password || u.port || !u.hostname.includes(".")) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0$|\[::1\]|\[fc|\[fd|\[fe80)/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const cors = origin && ORIGINS.has(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
  if (request.method === "OPTIONS") return new Response(null, {
    status: 204, headers: { ...cors, "access-control-allow-methods": "GET, OPTIONS" },
  });
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403);
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key || base !== "https://" + PROJECT + ".supabase.co") return json({ error: "unavailable" }, 503, cors);
  try {
    // Only active public references. The query never returns private snapshots,
    // extraction bodies, source metadata, or unpublished review material.
    const url = base + "/rest/v1/nyxi_sources?status=eq.active&select=source_key,title,authority,canonical_url,source_role&order=priority.asc&limit=60";
    const response = await fetch(url, {
      headers: { apikey: key, authorization: "Bearer " + key },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) throw new Error("database_unavailable");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("invalid_response");
    const seen = new Set<string>();
    const sources = data.flatMap(row => {
      if (!row || typeof row !== "object") return [];
      const url = safePublicLink(row.canonical_url);
      const sourceKey = typeof row.source_key === "string" ? row.source_key.slice(0, 90) : "";
      const title = typeof row.title === "string" ? row.title.trim().slice(0, 170) : "";
      const authority = typeof row.authority === "string" ? row.authority.trim().slice(0, 130) : "";
      if (!url || !sourceKey || !title || !authority || seen.has(sourceKey)) return [];
      seen.add(sourceKey);
      return [{ key: sourceKey, title, authority, url }];
    }).slice(0, 50);
    return json({
      status: "ok", kind: "public_source_references",
      publication: "links_only_not_evidence_approval",
      sources,
      count: sources.length,
    }, 200, cors);
  } catch {
    return json({ error: "unavailable" }, 503, cors);
  }
});

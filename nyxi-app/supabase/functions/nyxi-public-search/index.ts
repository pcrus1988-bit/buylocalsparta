// NYXI public search: no direct private evidence access, no unaudited publication.
const PROJECT = "eemihhfreggbigxejjhj";
const ORIGINS = new Set(["https://nyxi.gr", "https://www.nyxi.gr", "https://nyxi.kontamou.site"]);
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extra } });
const safeUrl = (value: unknown): string | null => {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".") &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0$|\[::1\]|\[fc|\[fd|\[fe80)/i.test(u.hostname) ? u.href : null;
  } catch { return null; }
};

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const cors = origin && ORIGINS.has(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" } });
  if (request.method !== "GET") return reply({ error: "method_not_allowed" }, 405, cors);
  if (origin && !ORIGINS.has(origin)) return reply({ error: "origin_not_allowed" }, 403);
  const url = new URL(request.url);
  const raw = url.searchParams.get("q") ?? "";
  const q = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > 100) return reply({ error: "query_too_long" }, 400, cors);
  if (!q) return reply({ status: "idle", query: "", results: [] }, 200, cors);
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key || base !== `https://${PROJECT}.supabase.co`) return reply({ error: "unavailable" }, 503, cors);
  const db = async (path: string, init: RequestInit = {}) => {
    const result = await fetch(base + path, {
      ...init,
      headers: { apikey: key, authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(6500),
    });
    if (!result.ok) throw new Error(`upstream_${result.status}`);
    return result.json();
  };
  try {
    // A global atomic limit remains mandatory even if a client spoofs a proxy IP header.
    const address = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 100);
    const secret = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", secret, new TextEncoder().encode(address));
    const fingerprint = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
    const allowed = await db("/rest/v1/rpc/nyxi_public_search_take_slot_v1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p_key_hash: fingerprint }) });
    if (allowed !== true) return reply({ error: "rate_limited" }, 429, { ...cors, "retry-after": "60" });

    const approved = await db("/rest/v1/nyxi_reviewed_fragments_v1?select=id&limit=1");
    if (!Array.isArray(approved)) throw new Error("invalid_approved_response");
    if (!approved.length) return reply({ status: "no_approved_evidence", query: q, results: [] }, 200, cors);
    // nyxi_search_v1 draws from reviewed-only search_documents_v1.
    const rows = await db("/rest/v1/rpc/nyxi_search_v1", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, p_limit: 8, p_latest_only: true }),
    });
    if (!Array.isArray(rows)) throw new Error("invalid_search_response");
    // Reconfirm every fragment against the independent approval view.
    const ids = [...new Set(rows.map((row) => row?.fragment_id).filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)))];
    if (!ids.length) return reply({ status: "no_matches", query: q, results: [] }, 200, cors);
    const confirmed = await db(`/rest/v1/nyxi_reviewed_fragments_v1?select=id&id=in.(${ids.join(",")})`);
    if (!Array.isArray(confirmed)) throw new Error("invalid_review_response");
    const allowedIds = new Set(confirmed.map((x) => x.id));
    const results = rows.filter((row) => allowedIds.has(row.fragment_id)).slice(0, 8).flatMap((row) => {
      const citation = safeUrl(row.final_url);
      const excerpt = typeof row.excerpt === "string" ? row.excerpt.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 650) : "";
      if (!citation || !excerpt) return [];
      return [{ id: String(row.record_id), type: String(row.record_type), authority: row.authority ?? null,
        jurisdiction: row.jurisdiction ?? null, category: row.evidence_class ?? null,
        excerpt, citation_url: citation }];
    });
    return reply({ status: results.length ? "ok" : "no_matches", query: q, results }, 200, cors);
  } catch {
    return reply({ error: "unavailable" }, 503, cors);
  }
});

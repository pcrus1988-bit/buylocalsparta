/**
 * NYXI Reviewer v1 — READ ONLY, identity + role gated.
 * This function deliberately has no publish/approve/revoke endpoint.
 *
 * Supabase validates JWT before handler (verify_jwt=true), and the handler
 * independently checks the token with GoTrue and the private allowlist.
 */
const PROJECT = "eemihhfreggbigxejjhj";
const BASE = "https://" + PROJECT + ".supabase.co";
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (base !== BASE || !anon || !service) return json({ error: "unavailable" }, 503);
  const jwt = /^Bearer ([A-Za-z0-9._-]{40,4000})$/.exec(req.headers.get("authorization") || "")?.[1];
  if (!jwt || jwt === anon || jwt === service) return json({ error: "unauthorized" }, 401);
  try {
    const auth = await fetch(BASE + "/auth/v1/user", {
      headers: { apikey: anon, authorization: "Bearer " + jwt },
      signal: AbortSignal.timeout(6000),
    });
    if (!auth.ok) return json({ error: "unauthorized" }, 401);
    const user = await auth.json();
    if (!user || !UUID.test(String(user.id)) || !user.email_confirmed_at) return json({ error: "unauthorized" }, 401);

    // Membership is NOT inferred from a matching email or an arbitrary JWT role.
    // Only a separately provisioned, non-disabled reviewer membership permits reads.
    const memberResp = await fetch(BASE + "/rest/v1/nyxi_reviewers?select=role,user_id&user_id=eq." + user.id + "&disabled_at=is.null&limit=1", {
      headers: { apikey: service, authorization: "Bearer " + service },
      signal: AbortSignal.timeout(6000),
    });
    if (!memberResp.ok) return json({ error: "unavailable" }, 503);
    const members = await memberResp.json();
    if (!Array.isArray(members)) return json({ error: "unavailable" }, 503);
    if (!members.length || !["reviewer","publisher"].includes(members[0].role)) return json({ error: "forbidden" }, 403);

    const url = new URL(req.url);
    const offsetRaw = Number(url.searchParams.get("offset") || "0");
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 500 ? offsetRaw : 0;
    const requestedLane = url.searchParams.get("lane") || "";
    const lane = ["human_evidence_review","page_chrome_review","duplicate_review","too_short_review"].includes(requestedLane) ? requestedLane : null;
    const params = new URLSearchParams();
    params.set("select","fragment_id,source_title,authority,source_role,official_source_url,snapshot_fetched_at,fragment_sha256,evidence_class,section_heading,ordinal,excerpt,text_length,quality_lane");
    params.set("order","source_title.asc,ordinal.asc");
    params.set("limit","10");
    params.set("offset",String(offset));
    if (lane) params.set("quality_lane","eq." + lane);
    const [queueResp,summaryResp] = await Promise.all([
      fetch(BASE + "/rest/v1/nyxi_private_review_queue_v1?" + params, {
        headers: { apikey: service, authorization: "Bearer " + service },
        signal: AbortSignal.timeout(6000),
      }),
      fetch(BASE + "/rest/v1/nyxi_private_review_readiness_v1?select=*", {
        headers: { apikey: service, authorization: "Bearer " + service },
        signal: AbortSignal.timeout(6000),
      }),
    ]);
    if (!queueResp.ok || !summaryResp.ok) return json({ error: "unavailable" }, 503);
    const rows = await queueResp.json(), summaries = await summaryResp.json();
    if (!Array.isArray(rows) || !Array.isArray(summaries)) return json({ error: "unavailable" }, 503);
    const queue = rows.slice(0,10).flatMap(row => {
      if (!row || !UUID.test(String(row.fragment_id)) || typeof row.excerpt !== "string") return [];
      const source = typeof row.official_source_url === "string" ? row.official_source_url : "";
      let safe = "";
      try {
        const u = new URL(source);
        if (u.protocol === "https:" && !u.username && !u.password && !u.port && u.hostname.includes(".") && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(u.hostname)) safe = u.href;
      } catch {}
      return [{
        fragment_id:row.fragment_id, source_title:String(row.source_title||"").slice(0,180),
        authority:String(row.authority||"").slice(0,120),source_url:safe,
        section:String(row.section_heading||"").slice(0,140),
        excerpt:row.excerpt.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0,1400),
        quality_lane:String(row.quality_lane||"").slice(0,60),
        snapshot_date:row.snapshot_fetched_at,
      }];
    });
    return json({ status: "ready_for_review", publication: "none", read_only: true, offset, queue, summary: summaries[0] || {} });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
});

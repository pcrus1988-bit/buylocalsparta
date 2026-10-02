import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";

const EXPECTED_TOKEN_SHA256 = "6939601f1e372b7e9578cd0ecab113f6bc075ca0ee57e1927683d73932e24935";
const WORKER_COUNT = 5;
const BATCH_LIMIT = 2;
const FETCH_TIMEOUT_MS = 9000;
const ASSET_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_ASSET_BYTES = 2_097_152;

const dbUrl = Deno.env.get("SUPABASE_DB_URL");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!dbUrl || !supabaseUrl || !serviceKey) throw new Error("missing_runtime_credentials");

const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 5 });

type BrandRow = {
  id: string;
  name: string;
  normalized_name: string | null;
  website: string | null;
  logo_object_key: string | null;
  metadata: Record<string, unknown> | null;
  product_count: number | string | null;
};

type SiteCandidate = { url: string; source: string };
type AssetCandidate =
  | { kind: "url"; url: string; score: number; discovery: string }
  | { kind: "inline_svg"; svg: string; score: number; discovery: string };

function jsonHeaders(extra: Record<string, string> = {}) {
  return { "content-type": "application/json", ...extra };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function fold(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function compact(value: string) {
  return fold(value).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
}

function slug(value: string) {
  return fold(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function coreTokens(value: string) {
  const stop = new Set(["the", "and", "of", "de", "la", "le", "di", "da", "for", "official", "shop", "store"]);
  return fold(value).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !stop.has(w));
}

function safeHttps(raw: string, base?: string) {
  try {
    const u = new URL(raw.trim().replaceAll("&amp;", "&"), base);
    if (u.protocol !== "https:" || u.username || u.password) return undefined;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return undefined;
    if (/^(?:127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(host)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function dedupe<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function websiteCandidates(brand: BrandRow): SiteCandidate[] {
  const out: SiteCandidate[] = [];
  const add = (url: string | null | undefined, source: string) => {
    if (!url) return;
    const safe = safeHttps(url);
    if (safe) out.push({ url: safe, source });
  };

  add(brand.website, "existing_website");
  const md = brand.metadata ?? {};
  add(typeof md.website_source_url === "string" ? md.website_source_url : undefined, "metadata_source");

  if (!brand.website) {
    const c = compact(brand.name);
    const s = slug(brand.name);
    if (c.length >= 3) {
      for (const host of [
        `www.${c}.com`,
        `${c}.com`,
        `www.${s}.com`,
        `${s}.com`,
        `www.${c}.it`,
        `www.${s}.it`
      ]) add(`https://${host}/`, "derived_domain");
    }
  }
  return dedupe(out, (x) => x.url).slice(0, 8);
}

function htmlSignals(html: string, brand: string, finalUrl: string) {
  const folded = fold(html.slice(0, MAX_HTML_BYTES));
  const tokens = coreTokens(brand);
  const phrase = fold(brand).replace(/\s+/g, " ").trim();
  const host = new URL(finalUrl).hostname.replace(/^www\./, "");
  const hostCompact = compact(host.split(".")[0] ?? "");
  const brandCompact = compact(brand);
  const title = fold(html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? "");
  const siteName = fold(
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:site_name|application-name)["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:site_name|application-name)["']/i)?.[1] ??
    ""
  );
  const titleHit = phrase.length >= 4 && (title.includes(phrase) || siteName.includes(phrase));
  const tokenHits = tokens.filter((t) => title.includes(t) || siteName.includes(t)).length;
  const bodyTokenHits = tokens.filter((t) => folded.includes(t)).length;
  const domainClose =
    brandCompact.length >= 4 &&
    (hostCompact === brandCompact || hostCompact.includes(brandCompact) || brandCompact.includes(hostCompact));

  const parked = /(domain (?:is )?for sale|buy this domain|sedo|afternic|hugedomains|godaddy domain)/i.test(folded.slice(0, 120000));
  const score = (titleHit ? 5 : 0) + Math.min(3, tokenHits * 2) + Math.min(2, bodyTokenHits) + (domainClose ? 4 : 0);
  const generic = tokens.length === 1 && (tokens[0]?.length ?? 0) <= 5;
  return { score, parked, generic, titleHit, domainClose };
}

async function fetchHtml(url: string) {
  const resp = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KONTA-MOY-BrandVerifier/2.0; +https://kontamou.site)",
      "accept-language": "en-US,en;q=0.9",
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
    }
  });
  if (!resp.ok) throw new Error(`site_http_${resp.status}`);
  const type = (resp.headers.get("content-type") || "").toLowerCase();
  if (type && !type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error(`site_type_${type.slice(0, 40)}`);
  const html = (await resp.text()).slice(0, MAX_HTML_BYTES);
  return { html, url: resp.url || url };
}

async function resolveOfficialSite(brand: BrandRow) {
  let lastReason = "no_candidate";
  for (const candidate of websiteCandidates(brand)) {
    try {
      const page = await fetchHtml(candidate.url);
      if (!safeHttps(page.url)) {
        lastReason = "unsafe_redirect";
        continue;
      }
      if (brand.website || candidate.source === "metadata_source") {
        return { ...page, source: candidate.source, verified: true };
      }
      const signals = htmlSignals(page.html, brand.name, page.url);
      if (signals.parked) {
        lastReason = "parked_domain";
        continue;
      }
      const needed = signals.generic ? 8 : 6;
      if (signals.score >= needed && (signals.titleHit || signals.domainClose)) {
        return { ...page, source: candidate.source, verified: true };
      }
      lastReason = `identity_score_${signals.score}`;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`official_site_unresolved:${lastReason}`);
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
}

function assetCandidates(html: string, pageUrl: string, brand: string): AssetCandidate[] {
  const out: AssetCandidate[] = [];
  const tokens = coreTokens(brand);
  const addUrl = (raw: string | undefined, score: number, discovery: string) => {
    if (!raw) return;
    const first = raw.split(",")[0]?.trim().split(/\s+/)[0];
    if (!first) return;
    const url = safeHttps(first, pageUrl);
    if (url) out.push({ kind: "url", url, score, discovery });
  };

  for (const m of html.matchAll(/"logo"\s*:\s*(?:"([^"]+)"|\{[^{}]{0,600}"url"\s*:\s*"([^"]+)")/gi)) {
    addUrl(m[1] || m[2], 170, "structured_logo");
  }

  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    const content = attr(tag, "content");
    if (key === "og:logo" || key === "twitter:logo") addUrl(content, 165, "meta_logo");
    if (key === "og:image" && /logo|brand|wordmark/i.test(content || "")) addUrl(content, 120, "og_image_logo");
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const lower = fold(tag);
    const alt = fold(attr(tag, "alt") || "");
    const brandHit = tokens.some((t) => alt.includes(t) || lower.includes(t));
    const logoHit = /\b(?:logo|wordmark|brandmark|site[-_ ]?brand|header[-_ ]?brand)\b/i.test(tag);
    if (!brandHit && !logoHit) continue;
    const raw = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "srcset");
    addUrl(raw, brandHit && logoHit ? 160 : brandHit ? 145 : 135, brandHit ? "brand_img" : "logo_img");
  }

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, "rel") || "").toLowerCase();
    const href = attr(tag, "href");
    if (rel.includes("mask-icon")) addUrl(href, 105, "mask_icon");
    else if (rel.includes("apple-touch-icon")) addUrl(href, 80, "apple_touch_icon");
    else if (rel.includes("icon")) addUrl(href, 55, "site_icon");
  }

  const svgRegex = /<svg\b[^>]{0,1200}>[\s\S]{0,180000}?<\/svg>/gi;
  for (const m of html.matchAll(svgRegex)) {
    const svg = m[0];
    const open = svg.slice(0, Math.min(svg.indexOf(">") + 1, 1200));
    const lower = fold(open);
    const brandHit = tokens.some((t) => lower.includes(t));
    const logoHit = /logo|wordmark|brandmark|site[-_ ]?brand|aria-label/i.test(open);
    if (brandHit || logoHit) {
      out.push({ kind: "inline_svg", svg, score: brandHit && logoHit ? 155 : 130, discovery: "inline_svg" });
      if (out.length > 40) break;
    }
  }

  return dedupe(out, (x) => x.kind === "url" ? `u:${x.url}` : `s:${x.svg.slice(0, 220)}`)
    .sort((a, b) => b.score - a.score)
    .slice(0, 35);
}

function safeSvg(svg: string) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return false;
  if (/<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']?\s*(?:https?:|data:|javascript:)/i.test(svg)) return false;
  return true;
}

async function fetchAsset(candidate: AssetCandidate) {
  if (candidate.kind === "inline_svg") {
    if (!safeSvg(candidate.svg)) throw new Error("unsafe_inline_svg");
    const bytes = new TextEncoder().encode(candidate.svg);
    if (bytes.byteLength < 80 || bytes.byteLength > MAX_ASSET_BYTES) throw new Error("invalid_inline_svg_size");
    return { bytes, mime: "image/svg+xml", ext: "svg" };
  }

  const resp = await fetch(candidate.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KONTA-MOY-BrandAssetVerifier/2.0; +https://kontamou.site)",
      accept: "image/svg+xml,image/png,image/webp,image/*;q=0.8,*/*;q=0.1"
    }
  });
  if (!resp.ok) throw new Error(`asset_http_${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.byteLength < 80 || bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`asset_size_${bytes.byteLength}`);

  const declared = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.byteLength, 5000)));
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return { bytes, mime: "image/png", ext: "png" };
  }
  if (new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") {
    return { bytes, mime: "image/webp", ext: "webp" };
  }
  if ((declared === "image/svg+xml" || head.trimStart().startsWith("<svg") || head.trimStart().startsWith("<?xml")) && safeSvg(new TextDecoder().decode(bytes))) {
    return { bytes, mime: "image/svg+xml", ext: "svg" };
  }
  throw new Error(`unsupported_asset_${declared || "unknown"}`);
}

function storagePath(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function uploadLogo(key: string, asset: { bytes: Uint8Array; mime: string }) {
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/brands/${storagePath(key)}`, {
    method: "POST",
    headers: {
      apikey: serviceKey!,
      Authorization: `Bearer ${serviceKey}`,
      "content-type": asset.mime,
      "x-upsert": "true",
      "cache-control": "public, max-age=31536000, immutable"
    },
    body: asset.bytes
  });
  if (!resp.ok) throw new Error(`storage_upload_${resp.status}:${(await resp.text()).slice(0, 120)}`);
}

async function chooseLogo(html: string, pageUrl: string, brand: string) {
  let last = "no_logo_candidate";
  for (const candidate of assetCandidates(html, pageUrl, brand)) {
    try {
      const asset = await fetchAsset(candidate);
      return { candidate, asset };
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(last);
}

function reasonText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 180);
}

async function processBrand(brand: BrandRow, workerId: number) {
  const now = new Date().toISOString();
  const md = brand.metadata && typeof brand.metadata === "object" ? { ...brand.metadata } : {};
  let page: { html: string; url: string; source: string; verified: boolean } | undefined;
  let website = brand.website?.trim() || null;
  let websiteChanged = false;
  let logoChanged = false;

  try {
    page = await resolveOfficialSite(brand);
    if (!website) {
      website = page.url;
      websiteChanged = true;
      Object.assign(md, {
        website_source_url: page.url,
        website_source_type: page.source === "derived_domain" ? "derived_official_domain_verified" : "official_site",
        website_verified_at: now
      });
    }
  } catch (error) {
    Object.assign(md, {
      website_checked_at: now,
      website_enrichment_status: website ? "complete" : "pending",
      website_enrichment_reason: website ? null : reasonText(error)
    });
  }

  if (!brand.logo_object_key && page) {
    try {
      const selected = await chooseLogo(page.html, page.url, brand.name);
      const key = `brands/${slug(brand.name) || "brand"}-${brand.id.slice(0, 8)}/logo.${selected.asset.ext}`;
      await uploadLogo(key, selected.asset);
      const sourceUrl = selected.candidate.kind === "url" ? selected.candidate.url : page.url;
      Object.assign(md, {
        logo_external_url: null,
        logo_source_url: sourceUrl,
        logo_source_domain: new URL(sourceUrl).hostname,
        logo_source_type: "official_site_canonical_copy",
        logo_source_page: page.url,
        logo_source_discovery: selected.candidate.discovery,
        logo_verified_at: now,
        logo_checked_at: now,
        logo_enrichment_status: "complete",
        logo_enrichment_reason: null
      });
      await sql`
        update public.brands
        set website = coalesce(nullif(website,''), ${website}),
            logo_object_key = ${key},
            metadata = ${JSON.stringify({ ...md, brand_backfill_agent: workerId + 1, brand_backfill_last_run_at: now })}::text::jsonb,
            updated_at = now()
        where id = ${brand.id}::uuid
      `;
      logoChanged = true;
      return { brand: brand.name, status: "updated", websiteChanged, logoChanged, website, key };
    } catch (error) {
      Object.assign(md, {
        logo_checked_at: now,
        logo_enrichment_status: "pending",
        logo_enrichment_reason: reasonText(error)
      });
    }
  }

  Object.assign(md, {
    brand_backfill_agent: workerId + 1,
    brand_backfill_last_run_at: now
  });
  await sql`
    update public.brands
    set website = case when nullif(website,'') is null then ${website} else website end,
        metadata = ${JSON.stringify(md)}::text::jsonb,
        updated_at = case when ${websiteChanged} then now() else updated_at end
    where id = ${brand.id}::uuid
  `;
  return {
    brand: brand.name,
    status: websiteChanged ? "website_updated" : "checked",
    websiteChanged,
    logoChanged,
    website,
    reason: md.logo_enrichment_reason ?? md.website_enrichment_reason ?? null
  };
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const supplied = req.headers.get("x-agent-token") || "";
  if (!supplied || await sha256(supplied) !== EXPECTED_TOKEN_SHA256) return new Response("forbidden", { status: 403 });

  const workerIdRaw = Number(req.headers.get("x-worker-id") ?? "-1");
  const workerId = Number.isInteger(workerIdRaw) ? workerIdRaw : -1;
  if (workerId < 0 || workerId >= WORKER_COUNT) return Response.json({ error: "invalid_worker_id" }, { status: 400, headers: jsonHeaders() });

  const rows = await sql<BrandRow[]>`
    with used as (
      select coalesce(cv.brand_id, pf.brand_id) as brand_id, count(*)::int as product_count
      from public.canonical_variants cv
      left join public.product_families pf on pf.id = cv.family_id
      where coalesce(cv.brand_id, pf.brand_id) is not null
        and coalesce(cv.suppressed,false) = false
        and coalesce(cv.recalled,false) = false
      group by coalesce(cv.brand_id, pf.brand_id)
    )
    select b.id::text,
           b.name,
           b.normalized_name,
           b.website,
           b.logo_object_key,
           coalesce(b.metadata,'{}'::jsonb) as metadata,
           coalesce(u.product_count,0)::int as product_count
    from public.brands b
    left join used u on u.brand_id=b.id
    where (
      nullif(b.website,'') is null
      or (nullif(b.logo_object_key,'') is null and nullif(b.metadata->>'logo_external_url','') is null)
    )
      and mod((hashtext(b.id::text)::bigint + 2147483648), ${WORKER_COUNT}) = ${workerId}
      and (
        nullif(b.metadata->>'brand_backfill_last_run_at','') is null
        or (b.metadata->>'brand_backfill_last_run_at')::timestamptz < now() - interval '18 hours'
      )
    order by coalesce(u.product_count,0) desc,
             coalesce((b.metadata->>'brand_backfill_last_run_at')::timestamptz, to_timestamp(0)) asc,
             lower(b.name),
             b.id
    limit ${BATCH_LIMIT}
  `;

  const results = [];
  for (const brand of rows) {
    try {
      results.push(await processBrand(brand, workerId));
    } catch (error) {
      results.push({ brand: brand.name, status: "failed", reason: reasonText(error) });
    }
  }

  return Response.json({
    worker: workerId + 1,
    workers: WORKER_COUNT,
    batchLimit: BATCH_LIMIT,
    selected: rows.length,
    elapsedMs: Date.now() - started,
    results
  }, { headers: { ...jsonHeaders(), "cache-control": "no-store" } });
});

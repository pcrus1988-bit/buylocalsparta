import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";

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

function isIpLiteral(host: string) {
  const h = host.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

function isPublicIpv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(ip: string) {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (h.startsWith("::ffff:")) {
    const mapped = h.slice("::ffff:".length);
    return /^\d/.test(mapped) ? isPublicIpv4(mapped) : false;
  }
  if (h === "::" || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || /^fe[89ab]/.test(h) || h.startsWith("ff")) return false;
  if (h.startsWith("2001:db8")) return false;
  const first = Number.parseInt(h.split(":")[0] || "0", 16);
  return Number.isFinite(first) && first >= 0x2000 && first <= 0x3fff;
}

function isPublicIp(ip: string) {
  return ip.includes(":") ? isPublicIpv6(ip) : isPublicIpv4(ip);
}

function safeHttps(raw: string, base?: string) {
  try {
    const u = new URL(raw.trim().replaceAll("&amp;", "&"), base);
    if (u.protocol !== "https:" || u.username || u.password) return undefined;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host.includes(".") || host === "localhost") return undefined;
    if ([".local", ".internal", ".localhost", ".home", ".lan", ".test", ".invalid"].some((s) => host.endsWith(s))) return undefined;
    if (isIpLiteral(host)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

const hostSafetyCache = new Map<string, Promise<boolean>>();

async function hostResolvesPublic(host: string) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  let cached = hostSafetyCache.get(normalized);
  if (cached) return cached;
  cached = (async () => {
    const lookup = async (type: "A" | "AAAA") => {
      const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(normalized)}&type=${type}`, {
        redirect: "error",
        signal: AbortSignal.timeout(3500),
        headers: { accept: "application/dns-json" }
      });
      if (!resp.ok) throw new Error(`dns_http_${resp.status}`);
      const data = await resp.json() as { Answer?: Array<{ data?: string }> };
      return (data.Answer ?? [])
        .map((x) => (x.data || "").trim())
        .filter((x) => type === "A" ? /^\d{1,3}(?:\.\d{1,3}){3}$/.test(x) : x.includes(":"));
    };
    try {
      const [v4, v6] = await Promise.all([lookup("A"), lookup("AAAA")]);
      const ips = [...v4, ...v6];
      return ips.length > 0 && ips.every(isPublicIp);
    } catch {
      return false;
    }
  })();
  hostSafetyCache.set(normalized, cached);
  return cached;
}

async function fetchSafe(url: string, init: RequestInit, timeoutMs: number) {
  let current = safeHttps(url);
  if (!current) throw new Error("unsafe_url");
  for (let hop = 0; hop <= 5; hop++) {
    const currentUrl = new URL(current);
    if (!await hostResolvesPublic(currentUrl.hostname)) throw new Error("unsafe_or_unresolved_destination");
    const resp = await fetch(current, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get("location");
      if (!location) throw new Error("redirect_without_location");
      const next = safeHttps(location, current);
      if (!next) throw new Error("unsafe_redirect");
      current = next;
      continue;
    }
    return { resp, url: current };
  }
  throw new Error("too_many_redirects");
}

async function readLimitedBody(resp: Response, maxBytes: number, label: string) {
  const declared = Number(resp.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${label}_too_large`);
  if (!resp.body) return new Uint8Array();
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`${label}_too_large`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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

function metadataDelta(original: Record<string, unknown>, next: Record<string, unknown>) {
  const delta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(original[key]) !== JSON.stringify(value)) delta[key] = value;
  }
  return delta;
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
  const { resp, url: finalUrl } = await fetchSafe(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KONTA-MOY-BrandVerifier/3.0; +https://kontamou.site)",
      "accept-language": "en-US,en;q=0.9",
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
    }
  }, FETCH_TIMEOUT_MS);
  if (!resp.ok) throw new Error(`site_http_${resp.status}`);
  const type = (resp.headers.get("content-type") || "").toLowerCase();
  if (type && !type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error(`site_type_${type.slice(0, 40)}`);
  const bytes = await readLimitedBody(resp, MAX_HTML_BYTES, "html");
  const html = new TextDecoder().decode(bytes);
  return { html, url: finalUrl };
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
    const raw = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "srcset");
    const brandHit = tokens.some((t) => alt.includes(t) || lower.includes(t));
    const logoHit = /\b(?:logo|wordmark|brandmark|site[-_ ]?brand|header[-_ ]?brand|navbar[-_ ]?brand)\b/i.test(tag)
      || /(?:logo|wordmark|brandmark|header[-_ ]?logo|site[-_ ]?logo)/i.test(raw || "");
    if (!logoHit) continue;
    addUrl(raw, brandHit ? 160 : 140, "logo_img");
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

  const { resp } = await fetchSafe(candidate.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; KONTA-MOY-BrandAssetVerifier/3.0; +https://kontamou.site)",
      accept: "image/svg+xml,image/png,image/webp,image/jpeg,image/*;q=0.8,*/*;q=0.1"
    }
  }, ASSET_TIMEOUT_MS);
  if (!resp.ok) throw new Error(`asset_http_${resp.status}`);
  const bytes = await readLimitedBody(resp, MAX_ASSET_BYTES, "asset");
  if (bytes.byteLength < 80) throw new Error(`asset_size_${bytes.byteLength}`);

  const declared = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.byteLength, 5000)));
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return { bytes, mime: "image/png", ext: "png" };
  }
  if (new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") {
    return { bytes, mime: "image/webp", ext: "webp" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { bytes, mime: "image/jpeg", ext: "jpg" };
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
  const originalMd = brand.metadata && typeof brand.metadata === "object" ? { ...brand.metadata } : {};
  const md = { ...originalMd };
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
        website_verified_at: now,
        website_enrichment_status: "complete",
        website_enrichment_reason: null
      });
    }
  } catch (error) {
    Object.assign(md, {
      website_checked_at: now,
      website_enrichment_status: website ? "complete" : "pending",
      website_enrichment_reason: website ? null : reasonText(error)
    });
  }

  const finishMeta = () => {
    const next = {
      ...md,
      brand_backfill_agent: workerId + 1,
      brand_backfill_last_run_at: now
    } as Record<string, unknown>;
    if (typeof originalMd.logo_retry_requested_at === "string") {
      next.logo_retry_acknowledged_at = now;
    }
    return metadataDelta(originalMd, next);
  };

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
      const patch = finishMeta();
      const updated = await sql<{ id: string }[]>`
        update public.brands
        set website = case when nullif(website,'') is null then ${website} else website end,
            logo_object_key = ${key},
            metadata = coalesce(metadata,'{}'::jsonb) || ${JSON.stringify(patch)}::text::jsonb,
            updated_at = now()
        where id = ${brand.id}::uuid
          and nullif(logo_object_key,'') is null
        returning id::text
      `;
      if (updated.length === 0) {
        return { brand: brand.name, status: "skipped_concurrent_logo_edit", websiteChanged: false, logoChanged: false };
      }
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

  const patch = finishMeta();
  await sql`
    update public.brands
    set website = case when nullif(website,'') is null then ${website} else website end,
        metadata = coalesce(metadata,'{}'::jsonb) || ${JSON.stringify(patch)}::text::jsonb,
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
  if (!supplied) return new Response("forbidden", { status: 403 });
  const authRows = await sql<{ ok: boolean }[]>`
    select exists(
      select 1
      from vault.decrypted_secrets
      where name = 'brand_backfill_agent_token'
        and decrypted_secret = ${supplied}
    ) as ok
  `;
  if (!authRows[0]?.ok) return new Response("forbidden", { status: 403 });

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
        or (
          nullif(b.metadata->>'logo_retry_requested_at','') is not null
          and (b.metadata->>'logo_retry_requested_at')::timestamptz >
              coalesce((b.metadata->>'brand_backfill_last_run_at')::timestamptz, to_timestamp(0))
        )
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

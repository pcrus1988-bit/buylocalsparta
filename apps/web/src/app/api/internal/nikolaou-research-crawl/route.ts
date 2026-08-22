import { gunzipSync } from "node:zlib";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type InputRow = { model: string; supplier_code: string; source_url: string };

type CrawlRow = InputRow & {
  final_url: string;
  http_status: number;
  page_title: string;
  h1: string;
  detected_model: string;
  detected_supplier_code: string;
  barcode: string;
  brand: string;
  supplier_description: string;
  specifications: Record<string, string>;
  included_items: string[];
  manual_urls: string[];
  spare_parts_urls: string[];
  related_models: string[];
  canonical_url: string;
  crawl_error: string;
};

const UA = "KONTA-MOU-catalogue-research/1.0 (+https://kontamou.site)";
const MODEL_TOKEN = /\b(?:BBP|BVC|BSS|BHL|BEP|BPN|BDC|BLF|BHT|BDS|BAG|BWH|BWR|BCP|BSM|BGB|EC|PC|PS|ES|EB|GH|GB|GP|KB|KWP|GM|ATS|BG|EK|EP|PM|CA)[A-Z0-9-]{2,}\b/gi;

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripTags(input: string): string {
  return decodeEntities(
    input
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/li>|<\/tr>|<\/div>|<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function firstMatch(html: string, re: RegExp): string {
  const m = re.exec(html);
  return m ? stripTags(m[1] ?? "").trim() : "";
}

function absUrl(href: string, base: string): string {
  try { return new URL(decodeEntities(href), base).toString(); } catch { return ""; }
}

function anchorUrls(html: string, base: string, predicate: (text: string, href: string) => boolean): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1] ?? "";
    const text = stripTags(m[2] ?? "").toLowerCase();
    if (predicate(text, href.toLowerCase())) {
      const u = absUrl(href, base);
      if (u) out.add(u);
    }
  }
  return [...out];
}

function segments(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const t = stripTags(m[1] ?? "").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
}

function parseSpecs(html: string): Record<string, string> {
  const specs: Record<string, string> = {};
  const candidates = [...segments(html, "li"), ...segments(html, "tr")];
  for (const text of candidates) {
    let key = "", value = "";
    if (text.includes(":")) {
      [key, value] = text.split(/:(.+)/, 2).map((x) => x.trim());
    } else {
      const cells = [...text.split(/\s{2,}|\t+/)].map((x) => x.trim()).filter(Boolean);
      if (cells.length >= 2) [key, value] = [cells[0]!, cells.slice(1).join(" ")];
    }
    if (key && value && key.length <= 120 && value.length <= 600) specs[key] ??= value;
  }
  return specs;
}

function descriptionFromHtml(html: string, h1: string): string {
  const paras = segments(html, "p");
  const excluded = ["copyright", "δ.νικολάου", "newsletter", "πολιτική απορρήτου", "συνεργασία", "service"];
  const chosen: string[] = [];
  for (const p of paras) {
    const low = p.toLowerCase();
    if (p === h1 || p.length < 35 || p.length > 1800) continue;
    if (excluded.some((x) => low.includes(x))) continue;
    if (/^(μοντέλο|κωδικός|barcode|μάρκα|σύγκρινέ)/i.test(p)) continue;
    if (p.split(/\s+/).length < 7) continue;
    if (!chosen.includes(p)) chosen.push(p);
    if (chosen.join(" ").length > 2200) break;
  }
  return chosen.join(" ").slice(0, 4000);
}

function metaContent(html: string, key: string, attr = "property"): string {
  const a = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeEntities(firstMatch(html, new RegExp(`<meta\\b[^>]*${attr}=["']${a}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i")) || firstMatch(html, new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${a}["'][^>]*>`, "i")));
}

async function crawl(row: InputRow): Promise<CrawlRow> {
  const base: CrawlRow = {
    ...row, final_url: "", http_status: 0, page_title: "", h1: "", detected_model: "", detected_supplier_code: "", barcode: "", brand: "", supplier_description: "", specifications: {}, included_items: [], manual_urls: [], spare_parts_urls: [], related_models: [], canonical_url: "", crawl_error: ""
  };
  try {
    const response = await fetch(row.source_url, {
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": UA, "accept-language": "el,en;q=0.8" },
      signal: AbortSignal.timeout(25000),
    });
    base.http_status = response.status;
    base.final_url = response.url;
    if (!response.ok) { base.crawl_error = `http_${response.status}`; return base; }
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) { base.crawl_error = `content_type_${ct}`; return base; }
    const html = await response.text();
    base.page_title = firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
    base.h1 = firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const text = stripTags(html);
    base.detected_model = (text.match(/(?:Μοντέλο|MODEL|Model)\s*:?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i)?.[1] ?? "").toUpperCase();
    base.detected_supplier_code = text.match(/(?:Κωδικός|CODE|Code)\s*:?\s*([0-9]{6,13})/i)?.[1] ?? "";
    base.barcode = text.match(/(?:Barcode|BARCODE)\s*:?\s*([0-9]{8,14})/i)?.[1] ?? "";
    base.brand = (text.match(/(?:Μάρκα|Brand)\s*:?\s*([^\n]{2,80})/i)?.[1] ?? "").trim();
    base.supplier_description = descriptionFromHtml(html, base.h1);
    base.specifications = parseSpecs(html);
    base.included_items = Object.entries(base.specifications).filter(([k]) => k.toLowerCase().includes("περιλαμβ")).map(([,v]) => v);
    base.manual_urls = anchorUrls(html, response.url, (t,h) => t.includes("οδηγίες χρήσης") || t.includes("manual") || h.includes("/manuals/"));
    base.spare_parts_urls = anchorUrls(html, response.url, (t,h) => t.includes("ανταλλακ") || h.includes("blueprint") || h.includes("spare"));
    const models = new Set((text.match(MODEL_TOKEN) ?? []).map((x) => x.toUpperCase()));
    models.delete(row.model.toUpperCase());
    base.related_models = [...models].slice(0, 100);
    const canonical = firstMatch(html, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) || firstMatch(html, /<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
    base.canonical_url = canonical ? absUrl(canonical, response.url) : (metaContent(html, "og:url") || response.url);
    return base;
  } catch (error) {
    base.crawl_error = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    return base;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function decodeBatch(value: string): InputRow[] {
  const pad = value.length % 4 ? "=".repeat(4 - (value.length % 4)) : "";
  const compressed = Buffer.from((value + pad).replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const json = gunzipSync(compressed).toString("utf8");
  const parsed = JSON.parse(json) as InputRow[];
  if (!Array.isArray(parsed) || parsed.length > 120) throw new Error("batch must contain 1-120 rows");
  return parsed.map((row) => ({ model: String(row.model ?? ""), supplier_code: String(row.supplier_code ?? ""), source_url: String(row.source_url ?? "") })).filter((row) => row.source_url.startsWith("https://www.nikolaoutools.gr/"));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const batch = url.searchParams.get("batch");
  if (!batch) return Response.json({ ok: false, error: "missing batch" }, { status: 400 });
  try {
    const rows = decodeBatch(batch);
    const results = await mapLimit(rows, 12, crawl);
    const summary = {
      requested: rows.length,
      ok: results.filter((r) => !r.crawl_error).length,
      errors: results.filter((r) => r.crawl_error).length,
      with_description: results.filter((r) => r.supplier_description).length,
      with_specs: results.filter((r) => Object.keys(r.specifications).length > 0).length,
      with_manual: results.filter((r) => r.manual_urls.length > 0).length,
      with_spares: results.filter((r) => r.spare_parts_urls.length > 0).length,
    };
    return Response.json({ ok: true, summary, results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";

const HOSTS = new Set(["nikolaoutools.gr", "www.nikolaoutools.gr"]);
const MAX_BYTES = 2 * 1024 * 1024;
const PENDING = "supplier_title_crawled_body_pending";
const LABELS: Readonly<Record<string, string>> = {
  "ισχυς watt": "power_w", "ισχυς w": "power_w", "ισχυς": "power_w",
  "μεγιστη παροχη lt h": "flow_l_h", "μεγιστη παροχη l h": "flow_l_h", "παροχη lt h": "flow_l_h", "παροχη l h": "flow_l_h",
  "μεγιστο μανομετρικο m": "max_head_m", "μεγιστο μανομετρικο": "max_head_m",
  "υψος αναρροφησης m": "suction_height_m", "υψος αναρροφησης": "suction_height_m", "υψος m": "suction_height_m",
  "μεγιστο μεγεθος σωματιδιων mm": "max_particle_size_mm", "μεγιστο μεγεθος σωματιδιων": "max_particle_size_mm",
  "οθονη": "display", "διαθετει": "features", "στομιο εισοδου inch": "inlet_in", "στομιο εξοδου inch": "outlet_in",
  "βαρος συσκευασιας kg": "package_weight_kg", "βαρος kg": "weight_kg", "καθαρο βαρος kg": "net_weight_kg",
  "διαστασεις συσκ τεμ cm μxπxυ": "package_dimensions_cm", "διαστασεις συσκ τεμ cm μ x π x υ": "package_dimensions_cm",
  "διαστασεις cm": "dimensions_cm", "πιεση bar": "pressure_bar", "μεγιστη πιεση bar": "pressure_bar",
  "ταση v": "voltage_v", "στροφες rpm": "rpm", "ταχυτητα rpm": "rpm", "διαμετρος mm": "diameter_mm",
  "μηκος mm": "length_mm", "μηκος cm": "length_cm", "μηκος m": "length_m", "πλατος mm": "width_mm", "υψος mm": "height_mm",
  "κυβισμος cc": "engine_cc", "ιπποδυναμη hp": "horsepower_hp", "υλικο": "material", "χρωμα": "color", "μεγεθος": "size"
};
const NUMERIC_KEYS = new Set(["power_w", "max_head_m", "suction_height_m", "max_particle_size_mm", "package_weight_kg", "weight_kg", "net_weight_kg", "pressure_bar", "voltage_v", "rpm", "diameter_mm", "length_mm", "length_cm", "length_m", "width_mm", "height_mm", "engine_cc", "horsepower_hp"]);

type SourceRow = { id: string; source_product_key: string; supplier_code: string | null; source_url: string };

function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function allowedUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" && HOSTS.has(url.hostname.toLowerCase()) ? url : undefined; } catch { return undefined; } }
function greek(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[()\[\]{}:.,;·'’“”\"/\\-]+/g, " ").replace(/\s+/g, " ").trim(); }
function fallbackKey(label: string) { return label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 72) || "source_spec"; }
function decodeEntities(value: string) {
  const named: Readonly<Record<string, string>> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»" };
  return value.replace(/&([a-zA-Z]+);/g, (all, name: string) => named[name] ?? all).replace(/&#(\d+);/g, (_all, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-fA-F]+);/g, (_all, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}
function cleanMarkdownLine(value: string) {
  return value
    .replace(/^\s*(?:[-+*]\s+|#{1,6}\s+)/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}
function lines(body: string) {
  const plain = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, " ").replace(/<!--([\s\S]*?)-->/g, " ").replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/dt|\/dd|\/section|\/article|\/a|\/span)>/giu, "\n").replace(/<(?:p|div|li|tr|h[1-6]|dt|dd|section|article|a|span)\b[^>]*>/giu, "\n").replace(/<[^>]+>/g, " ");
  return decodeEntities(plain).split(/\r?\n/).map((line) => cleanMarkdownLine(line.replace(/[\t\u00a0 ]+/g, " "))).filter(Boolean);
}
function identity(items: readonly string[], label: string) {
  const target = greek(label);
  for (const line of items) { const separator = line.indexOf(":"); if (separator >= 0 && greek(line.slice(0, separator)) === target) { const value = line.slice(separator + 1).trim(); if (value) return value; } }
}
function numberToken(value: string) { const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/); const parsed = match ? Number(match[0]) : NaN; return Number.isFinite(parsed) ? parsed : undefined; }
function valueFor(key: string, raw: string): string | number {
  const numeric = numberToken(raw);
  if (key === "flow_l_h" && numeric !== undefined) return `${numeric} L/h`;
  if ((key === "inlet_in" || key === "outlet_in") && numeric !== undefined) return `${numeric} in`;
  if (key === "package_dimensions_cm" || key === "dimensions_cm") { const match = raw.match(/(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)/); if (match) return `${match[1].replace(",", ".")} × ${match[2].replace(",", ".")} × ${match[3].replace(",", ".")} cm`; }
  return NUMERIC_KEYS.has(key) && numeric !== undefined ? numeric : raw;
}
function manualUrl(body: string, base: string) {
  const marker = body.search(/Οδηγ(?:ί|ι)ες\s+χρήσης/iu); const fragment = marker >= 0 ? body.slice(Math.max(0, marker - 1800), marker + 3000) : body;
  for (const match of fragment.matchAll(/href\s*=\s*["']([^"']+)["']/giu)) { if (!/\.pdf(?:$|[?#])|manual|odig|instructions|user.?guide/i.test(match[1])) continue; try { const url = new URL(decodeEntities(match[1]), base); if (url.protocol === "https:" && HOSTS.has(url.hostname.toLowerCase())) return url.toString(); } catch {} }
  for (const match of fragment.matchAll(/\]\((https:\/\/[^)]+)\)/giu)) { if (!/\.pdf(?:$|[?#])|manual|odig|instructions|user.?guide/i.test(match[1])) continue; try { const url = new URL(decodeEntities(match[1])); if (HOSTS.has(url.hostname.toLowerCase())) return url.toString(); } catch {} }
}
function parse(body: string, base: string) {
  const items = lines(body); const model = identity(items, "Μοντέλο"); const supplierCode = identity(items, "Κωδικός"); const brand = identity(items, "Μάρκα"); const barcode = identity(items, "Barcode")?.replace(/\D/g, "");
  const identityAt = items.findIndex((line) => /^Barcode\s*:/iu.test(line)); let start = -1;
  for (let i = Math.max(identityAt, 0); i < items.length; i += 1) if (greek(items[i]) === "χαρακτηριστικα") { start = i + 1; break; }
  if (start < 0) start = Math.max(identityAt + 1, 0);
  const specifications: Array<{ key: string; label: string; raw: string; value: string | number }> = []; const seen = new Set<string>();
  for (let i = start; i < Math.min(items.length, start + 180); i += 1) { const line = items[i]; if (/^(?:Εταιρεία|Εταιρική Υπευθυνότητα|Πολιτική Απορρήτου|Καταστήματα|Επικοινωνία)$/iu.test(line)) break; const separator = line.indexOf(":"); if (separator < 1) continue; const label = line.slice(0, separator).trim(); const raw = line.slice(separator + 1).trim(); if (!raw || label.length > 100 || raw.length > 220 || /^(?:Μοντέλο|Κωδικός|Barcode|Μάρκα|T|Tel|Fax)$/iu.test(label)) continue; const key = LABELS[greek(label)] ?? fallbackKey(label); if (seen.has(key)) continue; seen.add(key); specifications.push({ key, label, raw, value: valueFor(key, raw) }); }
  return { model, supplierCode, brand, gtin: barcode && barcode.length >= 8 ? barcode : undefined, manualUrl: manualUrl(body, base), specifications };
}
async function readBounded(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0); if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error("supplier_body_too_large");
  const body = await response.text(); if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error("supplier_body_too_large"); return body;
}
async function fetchSource(source: URL) {
  const direct = await fetch(source, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36", accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "accept-language": "el-GR,el;q=0.9,en;q=0.8", referer: "https://www.nikolaoutools.gr/" }, redirect: "follow", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  if (direct?.ok) {
    const finalUrl = allowedUrl(direct.url); const contentType = (direct.headers.get("content-type") ?? "").toLowerCase();
    if (finalUrl && contentType.includes("text/html")) return { body: await readBounded(direct), sourceUrl: finalUrl.toString(), transport: "direct" };
  }
  const reader = await fetch(`https://r.jina.ai/${source.toString()}`, { headers: { accept: "text/plain", "user-agent": "KONTA-MOU-Catalog-Enrichment/1.0" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!reader.ok) throw new Error(`reader_fetch_failed_${reader.status}`);
  return { body: await readBounded(reader), sourceUrl: source.toString(), transport: "reader" };
}

export async function GET(_request: Request, { params }: { params: Promise<{ sourceProductId: string }> }) {
  const { sourceProductId } = await params;
  if (!productionDatabaseConfigured() || !validUuid(sourceProductId)) return new NextResponse(null, { status: 404 });
  const result = await getProductionPostgresRuntime().sqlPool.query<SourceRow>(`SELECT csp.id::text,csp.source_product_key,csp.supplier_code,csp.source_url FROM catalog_source_products csp JOIN catalog_sources cs ON cs.id=csp.source_id WHERE csp.id=$1::uuid AND cs.code='nikolaou-tools' AND csp.normalized_payload->>'crawlStatus'=$2 AND csp.source_url IS NOT NULL LIMIT 1`, [sourceProductId, PENDING]);
  const row = result.rows[0]; const source = row ? allowedUrl(row.source_url) : undefined;
  if (!row || !source) return new NextResponse(null, { status: 404 });
  try {
    const fetched = await fetchSource(source); const parsed = parse(fetched.body, fetched.sourceUrl); const expected = (row.supplier_code ?? "").replace(/^0+/, ""); const observed = (parsed.supplierCode ?? "").replace(/^0+/, "");
    if (expected && observed && expected !== observed) return NextResponse.json({ error: "supplier_identity_mismatch", sourceProductId: row.id, sourceProductKey: row.source_product_key, expectedSupplierCode: row.supplier_code, observedSupplierCode: parsed.supplierCode, transport: fetched.transport }, { status: 409 });
    return NextResponse.json({ sourceProductId: row.id, sourceProductKey: row.source_product_key, importedSupplierCode: row.supplier_code, sourceUrl: fetched.sourceUrl, transport: fetched.transport, ...parsed }, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "catalogue.nikolaou_stage2_source_failed", sourceProductId, message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: "supplier_fetch_exception", detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

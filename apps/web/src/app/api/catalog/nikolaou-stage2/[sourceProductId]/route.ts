import { NextResponse } from "next/server";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";

const ALLOWED_SOURCE_HOSTS = new Set(["nikolaoutools.gr", "www.nikolaoutools.gr"]);
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const PENDING_STATUS = "supplier_title_crawled_body_pending";

const ATTRIBUTE_KEYS: Readonly<Record<string, string>> = {
  "ισχυς watt": "power_w",
  "ισχυς w": "power_w",
  "ισχυς": "power_w",
  "μεγιστη παροχη lt h": "flow_l_h",
  "μεγιστη παροχη l h": "flow_l_h",
  "παροχη lt h": "flow_l_h",
  "παροχη l h": "flow_l_h",
  "μεγιστο μανομετρικο m": "max_head_m",
  "μεγιστο μανομετρικο": "max_head_m",
  "υψος αναρροφησης m": "suction_height_m",
  "υψος αναρροφησης": "suction_height_m",
  "μεγιστο μεγεθος σωματιδιων mm": "max_particle_size_mm",
  "μεγιστο μεγεθος σωματιδιων": "max_particle_size_mm",
  "οθονη": "display",
  "διαθετει": "features",
  "στομιο εισοδου inch": "inlet_in",
  "στομιο εξοδου inch": "outlet_in",
  "βαρος συσκευασιας kg": "package_weight_kg",
  "βαρος kg": "weight_kg",
  "καθαρο βαρος kg": "net_weight_kg",
  "διαστασεις συσκ τεμ cm μxπxυ": "package_dimensions_cm",
  "διαστασεις συσκ τεμ cm μ x π x υ": "package_dimensions_cm",
  "διαστασεις cm": "dimensions_cm",
  "πιεση bar": "pressure_bar",
  "μεγιστη πιεση bar": "pressure_bar",
  "ταση v": "voltage_v",
  "στροφες rpm": "rpm",
  "ταχυτητα rpm": "rpm",
  "διαμετρος mm": "diameter_mm",
  "μηκος mm": "length_mm",
  "μηκος cm": "length_cm",
  "μηκος m": "length_m",
  "πλατος mm": "width_mm",
  "υψος mm": "height_mm",
  "κυβισμος cc": "engine_cc",
  "ιπποδυναμη hp": "horsepower_hp",
  "υλικο": "material",
  "χρωμα": "color",
  "μεγεθος": "size"
};

type SourceRow = Readonly<{
  id: string;
  source_product_key: string;
  supplier_code: string | null;
  title: string;
  source_url: string;
}>;

type ParsedSpec = Readonly<{
  key: string;
  label: string;
  raw: string;
  value: string | number;
}>;

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sourceUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase())) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function decodeEntities(input: string): string {
  const named: Readonly<Record<string, string>> = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
    ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»"
  };
  return input
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => named[name] ?? whole)
    .replace(/&#(\d+);/g, (_whole, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_whole, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function textLines(html: string): readonly string[] {
  const plain = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/dt|\/dd|\/section|\/article|\/a|\/span)>/giu, "\n")
    .replace(/<(?:p|div|li|tr|h[1-6]|dt|dd|section|article|a|span)\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(plain)
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t\u00a0 ]+/g, " ").trim())
    .filter(Boolean);
}

function normalizedGreek(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[()\[\]{}:.,;·'’“”\"/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72) || "source_spec";
}

function keyFor(label: string): string {
  return ATTRIBUTE_KEYS[normalizedGreek(label)] ?? fallbackKey(label);
}

function numericToken(value: string): number | undefined {
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizedValue(key: string, raw: string): string | number {
  const value = raw.trim();
  const numeric = numericToken(value);
  if (key === "flow_l_h" && numeric !== undefined) return `${numeric} L/h`;
  if ((key === "inlet_in" || key === "outlet_in") && numeric !== undefined) return `${numeric} in`;
  if (key === "package_dimensions_cm" || key === "dimensions_cm") {
    const match = value.match(/(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)/);
    if (match) return `${match[1].replace(",", ".")} × ${match[2].replace(",", ".")} × ${match[3].replace(",", ".")} cm`;
  }
  const numericKeys = new Set([
    "power_w", "max_head_m", "suction_height_m", "max_particle_size_mm", "package_weight_kg",
    "weight_kg", "net_weight_kg", "pressure_bar", "voltage_v", "rpm", "diameter_mm",
    "length_mm", "length_cm", "length_m", "width_mm", "height_mm", "engine_cc", "horsepower_hp"
  ]);
  if (numericKeys.has(key) && numeric !== undefined) return numeric;
  return value;
}

function identityValue(lines: readonly string[], label: string): string | undefined {
  const target = normalizedGreek(label);
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0 || normalizedGreek(line.slice(0, separator)) !== target) continue;
    const value = line.slice(separator + 1).trim();
    if (value) return value;
  }
  return undefined;
}

function manualUrl(html: string, baseUrl: string): string | undefined {
  const marker = html.search(/Οδηγ(?:ί|ι)ες\s+χρήσης/iu);
  const fragment = marker >= 0 ? html.slice(Math.max(0, marker - 1600), marker + 2600) : html;
  for (const match of fragment.matchAll(/href\s*=\s*["']([^"']+)["']/giu)) {
    const href = match[1];
    if (!/\.pdf(?:$|[?#])|manual|odig|instructions|user.?guide/i.test(href)) continue;
    try {
      const url = new URL(decodeEntities(href), baseUrl);
      if (url.protocol === "https:" && ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase())) return url.toString();
    } catch {
      // Ignore malformed supplier links and continue scanning.
    }
  }
  return undefined;
}

function parseSourcePage(html: string, baseUrl: string) {
  const lines = textLines(html);
  const model = identityValue(lines, "Μοντέλο");
  const supplierCode = identityValue(lines, "Κωδικός");
  const brand = identityValue(lines, "Μάρκα");
  const gtinCandidate = identityValue(lines, "Barcode")?.replace(/\D/g, "");
  const identityIndex = lines.findIndex((line) => /^Barcode\s*:/iu.test(line));
  let start = -1;
  for (let index = Math.max(identityIndex, 0); index < lines.length; index += 1) {
    if (normalizedGreek(lines[index]) === "χαρακτηριστικα") {
      start = index + 1;
      break;
    }
  }
  if (start < 0) start = Math.max(identityIndex + 1, 0);

  const specifications: ParsedSpec[] = [];
  const seen = new Set<string>();
  for (let index = start; index < Math.min(lines.length, start + 140); index += 1) {
    const line = lines[index];
    if (/^(?:Εταιρεία|Εταιρική Υπευθυνότητα|Πολιτική Απορρήτου|Καταστήματα|Επικοινωνία)$/iu.test(line)) break;
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const label = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (!raw || label.length > 100 || raw.length > 220) continue;
    if (/^(?:Μοντέλο|Κωδικός|Barcode|Μάρκα|T|Tel|Fax)$/iu.test(label)) continue;
    const key = keyFor(label);
    if (seen.has(key)) continue;
    seen.add(key);
    specifications.push({ key, label, raw, value: normalizedValue(key, raw) });
  }

  return {
    model,
    supplierCode,
    brand,
    gtin: gtinCandidate && gtinCandidate.length >= 8 ? gtinCandidate : undefined,
    manualUrl: manualUrl(html, baseUrl),
    specifications
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ sourceProductId: string }> }) {
  const { sourceProductId } = await params;
  if (!productionDatabaseConfigured() || !validUuid(sourceProductId)) return new NextResponse(null, { status: 404 });

  const result = await getProductionPostgresRuntime().sqlPool.query<SourceRow>(`
    SELECT csp.id::text,csp.source_product_key,csp.supplier_code,csp.title,csp.source_url
    FROM catalog_source_products csp
    JOIN catalog_sources cs ON cs.id=csp.source_id
    WHERE csp.id=$1::uuid
      AND cs.code='nikolaou-tools'
      AND csp.normalized_payload->>'crawlStatus'=$2
      AND csp.source_url IS NOT NULL
    LIMIT 1
  `, [sourceProductId, PENDING_STATUS]);
  const row = result.rows[0];
  const source = row ? sourceUrl(row.source_url) : undefined;
  if (!row || !source) return new NextResponse(null, { status: 404 });

  try {
    const response = await fetch(source, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "el-GR,el;q=0.9,en;q=0.8",
        "referer": "https://www.nikolaoutools.gr/"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return NextResponse.json({ error: "supplier_fetch_failed", status: response.status }, { status: 502 });
    const finalUrl = sourceUrl(response.url);
    if (!finalUrl) return NextResponse.json({ error: "supplier_redirect_rejected" }, { status: 502 });
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) return NextResponse.json({ error: "supplier_content_type_rejected" }, { status: 415 });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) return NextResponse.json({ error: "supplier_body_too_large" }, { status: 413 });
    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_SOURCE_BYTES) return NextResponse.json({ error: "supplier_body_too_large" }, { status: 413 });

    const parsed = parseSourcePage(html, finalUrl.toString());
    const expectedCode = (row.supplier_code ?? "").replace(/^0+/, "");
    const parsedCode = (parsed.supplierCode ?? "").replace(/^0+/, "");
    if (expectedCode && parsedCode && expectedCode !== parsedCode) {
      return NextResponse.json({
        error: "supplier_identity_mismatch",
        sourceProductId: row.id,
        sourceProductKey: row.source_product_key,
        expectedSupplierCode: row.supplier_code,
        observedSupplierCode: parsed.supplierCode
      }, { status: 409 });
    }

    return NextResponse.json({
      sourceProductId: row.id,
      sourceProductKey: row.source_product_key,
      supplierCode: row.supplier_code,
      sourceUrl: finalUrl.toString(),
      ...parsed
    }, {
      headers: {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "catalogue.nikolaou_stage2_source_failed",
      sourceProductId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return NextResponse.json({ error: "supplier_fetch_exception" }, { status: 502 });
  }
}

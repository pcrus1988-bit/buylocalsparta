/** Admin-only importer for locally verified official logo files.
 * Usage: DATABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node --experimental-strip-types scripts/enrich-brand-logos.ts manifest.json
 * Manifest: [{"brandId":"uuid","file":"/absolute/path/logo.svg","sourceUrl":"https://official.example/logo.svg","sourceType":"official"}]
 * Files are acquired and reviewed separately: this script never downloads user-provided URLs.
 */
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

type Entry = { brandId: string; file: string; sourceUrl: string; sourceType: "official" | "official_cdn" | "corporate" };
const projectUrl = "https://eemihhfreggbigxejjhj.supabase.co";

function mimeFor(file: string, bytes: Buffer): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (ext === ".webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (ext === ".svg") {
    const value = bytes.toString("utf8");
    if (/<svg[\s>]/i.test(value) && !/<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|\bon[a-z]+\s*=|(?:href|url)\s*=\s*["']?\s*(?:https?:|data:|javascript:)/i.test(value)) return "image/svg+xml";
  }
  throw new Error(`Unsupported, invalid or unsafe logo file: ${file}`);
}

const manifestFile = process.argv[2];
const dbUrl = process.env.DATABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!manifestFile || !dbUrl || !key) throw new Error("Manifest, DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const manifest = JSON.parse(await readFile(resolve(manifestFile), "utf8")) as Entry[];
if (!Array.isArray(manifest)) throw new Error("Manifest must be an array");
const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
try {
  for (const entry of manifest) {
    if (!/^[0-9a-f-]{36}$/i.test(entry.brandId) || !entry.file || !["official", "official_cdn", "corporate"].includes(entry.sourceType)) throw new Error("Invalid manifest entry");
    const source = new URL(entry.sourceUrl);
    if (source.protocol !== "https:" || !source.hostname.includes(".") || /^(?:localhost|\d+\.\d+\.\d+\.\d+)$/.test(source.hostname)) throw new Error("Invalid provenance URL");
    const brands = await pool.query<{ id: string; normalized_name: string; logo_object_key: string | null; metadata: Record<string, unknown> }>(
      "SELECT id,normalized_name,logo_object_key,metadata FROM public.brands WHERE id=$1", [entry.brandId]);
    const brand = brands.rows[0];
    if (!brand) throw new Error(`Unknown brand ${entry.brandId}`);
    const bytes = await readFile(resolve(entry.file));
    if (bytes.length < 100 || bytes.length > 2 * 1024 * 1024) throw new Error("Logo must be 100 B–2 MiB");
    const mime = mimeFor(entry.file, bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (brand.metadata?.logo_sha256 === digest && brand.logo_object_key) continue;
    const slug = brand.normalized_name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || entry.brandId;
    const objectKey = `brands/${slug}-${entry.brandId.slice(0, 8)}/logo.${mime === "image/svg+xml" ? "svg" : mime === "image/png" ? "png" : "webp"}`;
    const upload = await fetch(`${projectUrl}/storage/v1/object/brands/${objectKey}`, {
      method: "POST", headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": mime, "x-upsert": "true", "cache-control": "31536000" }, body: bytes
    });
    if (!upload.ok) throw new Error(`Storage upload failed for ${entry.brandId}: HTTP ${upload.status}`);
    await pool.query(`UPDATE public.brands SET logo_object_key=$2,metadata=metadata || $3::jsonb,updated_at=now() WHERE id=$1`, [
      entry.brandId, objectKey, JSON.stringify({ logo_source_url: entry.sourceUrl, logo_source_domain: source.hostname, logo_source_type: entry.sourceType, logo_verified_at: new Date().toISOString(), logo_sha256: digest })
    ]);
    console.log(`${entry.brandId} ${objectKey}`);
  }
} finally {
  await pool.end();
}

import { readFile } from "node:fs/promises";

const worker = await readFile("scripts/promote-nikolaou-staged-payload.ts", "utf8");
const importer = await readFile("scripts/import-nikolaou-master.ts", "utf8");
const trigger = await readFile("apps/web/src/app/api/internal/catalogue/promote-nikolaou/route.ts", "utf8");
const nextConfig = await readFile("apps/web/next.config.ts", "utf8");

const checks: Array<[string, boolean]> = [
  ["promotion requires a payload UUID", worker.includes("--payload-id=<uuid>")],
  ["promotion requires a ready payload", worker.includes('String(row.status) !== "ready"')],
  ["promotion locks the payload row", worker.includes("FOR UPDATE")],
  ["promotion uses the shared advisory lock", worker.includes("buy_local_sparta_nikolaou_promotion")],
  ["promotion uses platform runtime role", worker.includes("SET LOCAL ROLE bls_platform_runtime")],
  ["promotion verifies exact gzip hash", worker.includes("036659754afe49d29b97fffc4d472d00a885d6db67831cb99c0fb223285be765")],
  ["promotion verifies exact source hash", worker.includes("cd1fd865445190b0b008e42e91515584ebdf16d8430b61fbf64a50d6a54d5087")],
  ["promotion verifies exact gzip bytes", worker.includes("expectedCompressedBytes: 681_683")],
  ["promotion bounds decompression", worker.includes("maxOutputLength: MAX_SOURCE_BYTES")],
  ["promotion reuses robust CSV parser", worker.includes("parseCsv") && worker.includes("assertNikolaouHeaders")],
  ["promotion rejects duplicate source keys", worker.includes("duplicateSourceKeys")],
  ["promotion requires 3165 rows", worker.includes("expectedRows: 3_165")],
  ["promotion invokes existing v2 importer", worker.includes("scripts/import-nikolaou-master.ts") && worker.includes("--apply")],
  ["promotion does not auto-approve taxonomy", !worker.includes("--approve-high-confidence-taxonomy")],
  ["promotion proves 5976 attributes", worker.includes("expectedAttributes: 5_976")],
  ["promotion proves 2728 prices", worker.includes("expectedPriceObservations: 2_728")],
  ["promotion proves 825 compatibility claims", worker.includes("expectedCompatibilityClaims: 825")],
  ["promotion completes via governed DB function", worker.includes("bls_private.complete_catalog_source_import_payload")],
  ["promotion proves payload bytes are cleared", worker.includes("finalRow.payload_bytes !== null")],
  ["promotion supports imported recovery", worker.includes('String(payload.status) === "imported"')],
  ["importer remains transaction atomic", importer.includes('client.query("BEGIN")') && importer.includes('client.query("COMMIT")') && importer.includes('client.query("ROLLBACK")')],
  ["importer uses restricted platform runtime role", importer.includes("SET LOCAL ROLE bls_platform_runtime")],
  ["importer is exact v2", importer.includes('const IMPORTER_VERSION = "nikolaou-master-v2"')],
  ["importer refuses cross-version snapshot reuse", importer.includes("refusing to silently reuse")],
  ["importer creates source evidence products", importer.includes("INSERT INTO catalog_source_products")],
  ["importer creates source attributes", importer.includes("catalog_source_attribute_observations")],
  ["importer creates price observations", importer.includes("catalog_price_observations")],
  ["importer creates compatibility claims as candidate", importer.includes("product_compatibility_claims") && importer.includes('"candidate"')],
  ["HTTP trigger is fixed to the verified payload", trigger.includes('const PAYLOAD_ID = "c888d656-b566-4e2d-9e4f-f3318cdd2293"')],
  ["HTTP trigger requires one-shot Vault authorization", trigger.includes("vault.decrypted_secrets") && trigger.includes("DELETE FROM vault.secrets")],
  ["HTTP trigger serializes authorization consumption", trigger.includes("nikolaou_promotion_http_trigger")],
  ["HTTP trigger requires ready exact contract", trigger.includes('String(row.status) !== "ready"') && trigger.includes("EXPECTED_SOURCE_SHA") && trigger.includes("EXPECTED_COMPRESSED_SHA")],
  ["HTTP GET requires the one-shot capability", trigger.includes("export async function GET(request: Request)") && trigger.includes('searchParams.get("token")') && trigger.includes("DELETE FROM vault.secrets")],
  ["HTTP trigger is no-store/noindex", trigger.includes('"Cache-Control": "private, no-store, max-age=0"') && trigger.includes('"X-Robots-Tag": "noindex, nofollow, noarchive"')],
  ["HTTP trigger has bounded execution duration", trigger.includes("export const maxDuration = 300")],
  ["Vercel trace includes promotion worker", nextConfig.includes('"../../scripts/promote-nikolaou-staged-payload.ts"')],
  ["Vercel trace includes importer", nextConfig.includes('"../../scripts/import-nikolaou-master.ts"')],
  ["Vercel trace includes shared parser", nextConfig.includes('"../../scripts/catalogue/nikolaou-import-lib.ts"')]
];

const forbidden = [
  "vendor_offers",
  "vendor_catalog_assortments",
  "inventory_reservations",
  "inventory_items",
  "product_identifiers",
  "canonical_products",
  "canonical_variants"
];
for (const table of forbidden) {
  checks.push([`promotion worker does not touch ${table}`, !worker.includes(table)]);
  checks.push([`Nikolaou importer does not touch ${table}`, !importer.includes(table)]);
  checks.push([`HTTP trigger does not touch ${table}`, !trigger.includes(table)]);
}

const failures = checks.filter(([, ok]) => !ok).map(([label]) => label);
if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checks: checks.length }, null, 2));

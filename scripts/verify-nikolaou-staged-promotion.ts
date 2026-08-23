import { readFile } from "node:fs/promises";

const worker = await readFile("scripts/promote-nikolaou-staged-payload.ts", "utf8");
const importer = await readFile("scripts/import-nikolaou-master.ts", "utf8");

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
  ["importer is exact v2", importer.includes('const IMPORTER_VERSION = "nikolaou-master-v2"')],
  ["importer refuses cross-version snapshot reuse", importer.includes("refusing to silently reuse")],
  ["importer creates source evidence products", importer.includes("INSERT INTO catalog_source_products")],
  ["importer creates source attributes", importer.includes("catalog_source_attribute_observations")],
  ["importer creates price observations", importer.includes("catalog_price_observations")],
  ["importer creates compatibility claims as candidate", importer.includes("product_compatibility_claims") && importer.includes('"candidate"')]
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
}

const failures = checks.filter(([, ok]) => !ok).map(([label]) => label);
if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checks: checks.length }, null, 2));

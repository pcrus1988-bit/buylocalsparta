import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const migration = read("db/migrations/0119_catalog_source_import_payloads.sql");
const checksums = JSON.parse(read("db/migrations/checksums.json")) as Record<string, string>;
const runtime = read("packages/postgres-runtime/src/index.ts");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const hash = createHash("sha256").update(migration).digest("hex");
expect(checksums["0119_catalog_source_import_payloads.sql"] === hash, `0119 checksum mismatch: manifest=${checksums["0119_catalog_source_import_payloads.sql"] ?? "missing"} actual=${hash}`);
expect(runtime.includes("EXPECTED_SCHEMA_VERSION = 127"), "PostgreSQL runtime schema target must be 127");

for (const contract of [
  "CREATE TABLE catalog_source_import_payloads",
  "expected_source_sha256 text NOT NULL",
  "expected_compressed_sha256 text NOT NULL",
  "expected_row_count integer NOT NULL",
  "compression IN ('gzip')",
  "status IN ('staging','ready','imported','rejected')",
  "ENABLE ROW LEVEL SECURITY",
  "REVOKE ALL ON TABLE catalog_source_import_payloads FROM PUBLIC, anon, authenticated, service_role",
  "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_source_import_payloads TO bls_platform_runtime",
  "staging payload bytes are append-only",
  "extensions.digest(v_payload.payload,'sha256')",
  "compressed payload checksum mismatch",
  "status='imported'",
  "payload=NULL",
  "imported_snapshot_id=p_snapshot_id"
]) expect(migration.includes(contract), `Catalogue source import staging is missing ${contract}`);

expect(!migration.includes("vendor_offers"), "Source transport must never create or mutate vendor offers");
expect(!migration.includes("vendor_catalog_assortments"), "Source transport must not imply vendor assortment");
expect(!migration.includes("SECURITY DEFINER"), "Source transport functions must not bypass caller privileges");

if (failures.length) {
  console.error("Catalogue source import payload checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Catalogue source import payload checks passed: checksum ${hash}; private gzip staging, append-only transport, checksum sealing and payload erasure verified.`);

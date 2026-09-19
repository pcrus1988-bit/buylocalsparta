import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadManifest, loadMigrations, migrationDirectoryFrom, verifyMigrationManifest } from "./migration-lib.ts";

const directory = migrationDirectoryFrom(import.meta.url);
const manifestPath = join(directory, "checksums.json");
const migrations = await loadMigrations(directory);
const manifest = await loadManifest(manifestPath);
verifyMigrationManifest(migrations, manifest);

const runtimeHardening = migrations.find((migration) => migration.filename === "0002_runtime_hardening.sql");
if (!runtimeHardening?.sql.includes("order_lines_fulfilled_quantity_nonnegative_check") ||
    !runtimeHardening.sql.includes("order_lines_refunded_quantity_nonnegative_check")) {
  throw new Error("Migration 0002 must use distinct names for nonnegative quantity checks");
}

const postgresRuntimeSource = await readFile(
  join(directory, "..", "..", "packages", "postgres-runtime", "src", "index.ts"),
  "utf8"
);
const expectedSchemaMatch = postgresRuntimeSource.match(
  /export const EXPECTED_SCHEMA_VERSION\s*=\s*(\d+)\s*;/
);
if (!expectedSchemaMatch) {
  throw new Error("Unable to resolve EXPECTED_SCHEMA_VERSION from packages/postgres-runtime/src/index.ts");
}

const expectedSchemaVersion = Number(expectedSchemaMatch[1]);
const latestMigrationVersion = migrations.at(-1)?.version ?? 0;
if (expectedSchemaVersion !== latestMigrationVersion) {
  throw new Error(
    `Runtime schema gate mismatch: EXPECTED_SCHEMA_VERSION=${expectedSchemaVersion}, latest migration=${latestMigrationVersion}. ` +
    "Update the runtime schema gate in the same commit as the migration so web and Railway workers cannot deploy against different schema expectations."
  );
}

console.log(
  `Migration integrity OK: ${migrations.length} immutable migrations verified; runtime schema gate is ${expectedSchemaVersion}.`
);

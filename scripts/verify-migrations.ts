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
console.log(`Migration integrity OK: ${migrations.length} immutable migrations verified.`);

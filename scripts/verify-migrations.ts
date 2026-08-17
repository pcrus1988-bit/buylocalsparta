import { join } from "node:path";
import { loadManifest, loadMigrations, migrationDirectoryFrom, verifyMigrationManifest } from "./migration-lib.ts";

const directory = migrationDirectoryFrom(import.meta.url);
const manifestPath = join(directory, "checksums.json");
const migrations = await loadMigrations(directory);
const manifest = await loadManifest(manifestPath);
verifyMigrationManifest(migrations, manifest);
console.log(`Migration integrity OK: ${migrations.length} immutable migrations verified.`);

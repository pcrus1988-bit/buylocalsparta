import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type MigrationFile = Readonly<{
  filename: string;
  version: number;
  sql: string;
  sha256: string;
}>;

/**
 * Frozen pre-canonical SQL snapshots. These files were historically applied
 * outside the numbered application ledger and are retained only as evidence.
 * They are never executable migrations. Any additional noncanonical .sql file
 * in db/migrations is rejected so a second migration history cannot reappear.
 */
const LEGACY_NONCANONICAL_SQL = new Set([
  "20260915_drop_unused_vendor_assortment_covering_indexes.sql",
  "20260915_storefront_catalog_autocomplete_expression.sql",
  "20260915_storefront_catalog_read_model.sql",
  "20260915_storefront_catalog_trigram_search.sql",
  "20260915_storefront_category_availability_index.sql",
  "20260915_storefront_dropship_family_covering_index.sql",
  "20260915_storefront_dropship_family_filter_read_model.sql",
  "20260915_storefront_dropship_family_read_model.sql",
  "20260915_storefront_dropship_vendor_facets.sql",
  "20260915_storefront_facet_read_model.sql",
  "20260915_storefront_filter_read_model.sql",
  "20260915_storefront_local_candidate_index.sql",
  "20260915_storefront_read_model_refresh_schedule.sql",
  "20260915_storefront_read_model_refresh_schedule_v2.sql",
  "20260915_storefront_seo_signal_indexes.sql",
  "20260915_storefront_vendor_assortment_read_model.sql",
  "20260915_vendor_family_read_model_index.sql",
  "20260915_vendor_public_assortment_covering_indexes.sql",
  "20260917_storefront_dropship_rich_filter_facets.sql",
  "20260919_storefront_refresh_command_repair.sql",
  "20260919_storefront_refresh_load_shedding.sql",
  "20260920202509_nova_availability_burst_and_projection_refresh.sql",
  "20260920205125_nova_live_storefront_incremental_projection.sql",
  "20260920_nova_availability_failover_staggered_acceleration.sql",
  "20260920_nova_availability_failover_staggered_acceleration_v2.sql",
  "20260929_p0_vendor_local_catalog_fast_index.sql",
  "20261001_admin_storefront_media_blob_fallback.sql",
  "20261001_vendor_instagram_storefront.sql",
  "20261002_merchant_sync_strict_shard_index.sql",
  "20261002_seo_recovery_load_shedding.sql",
  "20261002_vendor_locations_rls_empty_context.sql",
]);

const CANONICAL_MIGRATION_NAME = /^\\d{4}_[a-z0-9_-]+\\.sql$/i;

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function loadMigrations(directory: string): Promise<readonly MigrationFile[]> {
  const directoryNames = await readdir(directory);
  const unexpectedSql = directoryNames.filter(
    (name) => name.toLowerCase().endsWith(".sql") &&
      !CANONICAL_MIGRATION_NAME.test(name) &&
      !LEGACY_NONCANONICAL_SQL.has(name)
  );
  if (unexpectedSql.length) {
    throw new Error(
      "Noncanonical SQL migration filenames are forbidden: " + unexpectedSql.sort().join(", ") +
      ". Use the next four-digit migration version and register its checksum."
    );
  }

  const names = directoryNames
    .filter((name) => CANONICAL_MIGRATION_NAME.test(name))
    .sort((a, b) => a.localeCompare(b));
  const seen = new Set<number>();
  const result: MigrationFile[] = [];
  for (const filename of names) {
    const version = Number(filename.slice(0, 4));
    if (seen.has(version)) throw new Error(`Duplicate migration version ${version}`);
    seen.add(version);
    const sql = await readFile(join(directory, filename), "utf8");
    if (!sql.trim()) throw new Error(`Migration ${filename} is empty`);
    result.push({ filename, version, sql, sha256: sha256(sql) });
  }
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].version <= result[index - 1].version) throw new Error("Migrations are not strictly increasing");
  }
  return result;
}

export type ChecksumManifest = Readonly<Record<string, string>>;

export async function loadManifest(path: string): Promise<ChecksumManifest> {
  const directory = dirname(path);
  const baseFilename = basename(path);
  const fragmentFilenames = (await readdir(directory))
    .filter((filename) => /^checksums\.\d{4}\.json$/i.test(filename))
    .sort((a, b) => a.localeCompare(b));
  const filenames = [baseFilename, ...fragmentFilenames];
  const merged: Record<string, string> = {};

  for (const filename of filenames) {
    const raw = JSON.parse(await readFile(join(directory, filename), "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Migration checksum manifest ${filename} is invalid`);
    }
    for (const [migrationFilename, checksum] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/i.test(checksum)) {
        throw new Error(`Migration checksum ${migrationFilename} in ${filename} is invalid`);
      }
      if (Object.hasOwn(merged, migrationFilename)) {
        if (merged[migrationFilename] !== checksum) {
          throw new Error(`Migration checksum ${migrationFilename} is registered with conflicting values`);
        }
        continue;
      }
      merged[migrationFilename] = checksum;
    }
  }

  return merged;
}

export function verifyMigrationManifest(migrations: readonly MigrationFile[], manifest: ChecksumManifest): void {
  const migrationNames = new Set(migrations.map((migration) => migration.filename));
  const failures: string[] = [];

  for (const migration of migrations) {
    const expected = manifest[migration.filename];
    if (!expected) {
      failures.push(`Migration ${migration.filename} is missing from checksum manifest (sha256 ${migration.sha256})`);
      continue;
    }
    if (expected !== migration.sha256) {
      failures.push(`Migration ${migration.filename} was modified after checksum registration (expected ${expected}, actual ${migration.sha256})`);
    }
  }

  for (const filename of Object.keys(manifest)) {
    if (!migrationNames.has(filename)) failures.push(`Checksum manifest references missing migration ${filename}`);
  }

  if (failures.length) throw new Error(failures.join("\n"));
}

export function migrationDirectoryFrom(importMetaUrl: string): string {
  const scriptsDir = dirname(fileURLToPath(importMetaUrl));
  return join(scriptsDir, "..", "db", "migrations");
}

export function describeMigration(migration: MigrationFile): string {
  return `${String(migration.version).padStart(4, "0")} ${basename(migration.filename)} ${migration.sha256.slice(0, 12)}`;
}

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

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function loadMigrations(directory: string): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(name))
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
        throw new Error(`Migration checksum ${migrationFilename} is registered more than once`);
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

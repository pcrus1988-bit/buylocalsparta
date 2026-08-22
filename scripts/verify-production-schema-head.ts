import { createHash } from "node:crypto";
import { join } from "node:path";
import { loadManifest, loadMigrations, migrationDirectoryFrom, verifyMigrationManifest, type MigrationFile } from "./migration-lib.ts";

const productionOnly = process.argv.includes("--vercel-production-only");
if (productionOnly && process.env.VERCEL_ENV !== "production") {
  console.log(`Production schema gate skipped for VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}.`);
} else {
  await verifyProductionSchemaHead();
}

async function verifyProductionSchemaHead(): Promise<void> {
  const directory = migrationDirectoryFrom(import.meta.url);
  const migrations = await loadMigrations(directory);
  const manifest = await loadManifest(join(directory, "checksums.json"));
  verifyMigrationManifest(migrations, manifest);

  if (migrations.length === 0) {
    throw new Error("Repository contains no migrations; refusing production schema verification");
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    await verifyDirectDatabase(connectionString, migrations);
    return;
  }

  if (productionOnly && process.env.VERCEL_ENV === "production") {
    await verifyThroughProductionRuntime(migrations);
    return;
  }

  throw new Error("DATABASE_URL is required for the production schema gate outside Vercel production builds");
}

async function verifyDirectDatabase(connectionString: string, migrations: readonly MigrationFile[]): Promise<void> {
  let pgModule: any;
  try {
    pgModule = await import("pg");
  } catch {
    throw new Error("PostgreSQL driver 'pg' is not installed. Install workspace dependencies before verifying production schema.");
  }
  const Pool = pgModule.Pool ?? pgModule.default?.Pool;
  if (!Pool) throw new Error("Unable to load pg.Pool");

  const pool = new Pool({
    connectionString,
    max: 1,
    application_name: "buy-local-sparta-production-schema-gate",
  });

  try {
    const table = await pool.query("SELECT to_regclass('public.schema_migrations') AS name");
    if (!table.rows[0]?.name) {
      throw new Error("Production database has no public.schema_migrations table; refusing deployment");
    }

    const applied = await pool.query(
      "SELECT version, filename, sha256 FROM public.schema_migrations ORDER BY version",
    );
    assertLedgerMatchesRepository(applied.rows, migrations, "direct production database");
  } finally {
    await pool.end();
  }
}

async function verifyThroughProductionRuntime(migrations: readonly MigrationFile[]): Promise<void> {
  const origin = productionSchemaOrigin();
  const schemaUrl = new URL("/api/health/schema", origin);
  const response = await fetch(schemaUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });

  // One-time bootstrap only: the deployment immediately before this endpoint was
  // introduced knows schema 115 but cannot expose the full ledger fingerprint yet.
  // No repository schema newer than 115 is ever allowed to use this fallback.
  if (response.status === 404 && migrations.at(-1)!.version === 115) {
    await verifyLegacyReadinessBootstrap(origin, migrations);
    return;
  }

  if (!response.ok) {
    throw new Error(`Production schema fingerprint endpoint returned HTTP ${response.status}; deployment is blocked`);
  }

  const payload = await response.json() as {
    ok?: unknown;
    headVersion?: unknown;
    migrationCount?: unknown;
    fingerprint?: unknown;
  };
  const expectedHead = migrations.at(-1)!;
  const expectedFingerprint = ledgerFingerprint(migrations);
  const failures: string[] = [];
  if (payload.ok !== true) failures.push("runtime schema endpoint did not report ok=true");
  if (Number(payload.headVersion) !== expectedHead.version) {
    failures.push(`head version repository=${expectedHead.version}, production=${String(payload.headVersion)}`);
  }
  if (Number(payload.migrationCount) !== migrations.length) {
    failures.push(`migration count repository=${migrations.length}, production=${String(payload.migrationCount)}`);
  }
  if (String(payload.fingerprint ?? "") !== expectedFingerprint) {
    failures.push("full migration-ledger fingerprint does not match repository versions, filenames and checksums");
  }
  if (failures.length) throwDrift(expectedHead, failures, "production runtime fingerprint");

  console.log(
    `Production schema gate OK via runtime fingerprint: ${migrations.length} migrations match through ${String(expectedHead.version).padStart(4, "0")} ${expectedHead.filename}.`,
  );
}

async function verifyLegacyReadinessBootstrap(origin: URL, migrations: readonly MigrationFile[]): Promise<void> {
  const expectedHead = migrations.at(-1)!;
  const response = await fetch(new URL("/api/health/ready", origin), {
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => undefined) as
    | { dependencies?: { database?: { appliedSchemaVersion?: unknown; pendingMigrations?: unknown } } }
    | undefined;
  const database = payload?.dependencies?.database;
  const failures: string[] = [];
  if (Number(database?.appliedSchemaVersion) !== expectedHead.version) {
    failures.push(`legacy readiness schema repository=${expectedHead.version}, production=${String(database?.appliedSchemaVersion)}`);
  }
  if (Number(database?.pendingMigrations) !== 0) {
    failures.push(`legacy readiness reports pendingMigrations=${String(database?.pendingMigrations)}`);
  }
  if (failures.length) throwDrift(expectedHead, failures, "legacy readiness bootstrap");

  console.log(
    `Production schema gate bootstrap OK at schema ${expectedHead.version}; future releases require the full runtime ledger fingerprint endpoint.`,
  );
}

function assertLedgerMatchesRepository(rows: readonly any[], migrations: readonly MigrationFile[], source: string): void {
  const repositoryByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const appliedByVersion = new Map<number, { filename: string; sha256: string }>();
  const failures: string[] = [];

  for (const row of rows as Array<{ version: number | string; filename: string; sha256: string }>) {
    const version = Number(row.version);
    const filename = String(row.filename);
    const sha256 = String(row.sha256).trim();
    appliedByVersion.set(version, { filename, sha256 });

    const repositoryMigration = repositoryByVersion.get(version);
    if (!repositoryMigration) {
      failures.push(`production has migration ${version} (${filename}) absent from this repository revision`);
      continue;
    }
    if (repositoryMigration.filename !== filename) {
      failures.push(`migration ${version} filename repository=${repositoryMigration.filename}, production=${filename}`);
    }
    if (repositoryMigration.sha256 !== sha256) {
      failures.push(`migration ${version} checksum repository=${repositoryMigration.sha256}, production=${sha256}`);
    }
  }

  for (const migration of migrations) {
    if (!appliedByVersion.has(migration.version)) failures.push(`production is missing repository migration ${migration.filename}`);
  }

  if (failures.length) throwDrift(migrations.at(-1)!, failures, source);
  const head = migrations.at(-1)!;
  console.log(
    `Production schema gate OK via ${source}: ${migrations.length} migrations match through ${String(head.version).padStart(4, "0")} ${head.filename}.`,
  );
}

function ledgerFingerprint(entries: readonly Pick<MigrationFile, "version" | "filename" | "sha256">[]): string {
  const canonical = entries.map((entry) => `${entry.version}\t${entry.filename}\t${entry.sha256}`).join("\n");
  return createHash("sha256").update(`schema-ledger-v1\n${canonical}`).digest("hex");
}

function productionSchemaOrigin(): URL {
  const configured = process.env.BLS_PRODUCTION_SCHEMA_STATUS_ORIGIN?.trim() || "https://kontamou.site";
  const origin = new URL(configured);
  if (origin.protocol !== "https:") throw new Error("Production schema status origin must use HTTPS");
  return origin;
}

function throwDrift(head: MigrationFile, failures: readonly string[], source: string): never {
  throw new Error(
    [
      "Production schema drift detected; deployment is blocked.",
      `Verification source: ${source}`,
      `Repository head: ${String(head.version).padStart(4, "0")} ${head.filename}`,
      ...failures.map((failure) => `- ${failure}`),
      "Apply/reconcile the repository migrations in production first, then redeploy the same commit.",
    ].join("\n"),
  );
}

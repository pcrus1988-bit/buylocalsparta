import { join } from "node:path";
import { loadManifest, loadMigrations, migrationDirectoryFrom, verifyMigrationManifest } from "./migration-lib.ts";

const productionOnly = process.argv.includes("--vercel-production-only");
if (productionOnly && process.env.VERCEL_ENV !== "production") {
  console.log(`Production schema gate skipped for VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}.`);
} else {
  await verifyProductionSchemaHead();
}

async function verifyProductionSchemaHead(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the production schema gate");
  }

  const directory = migrationDirectoryFrom(import.meta.url);
  const migrations = await loadMigrations(directory);
  const manifest = await loadManifest(join(directory, "checksums.json"));
  verifyMigrationManifest(migrations, manifest);

  if (migrations.length === 0) {
    throw new Error("Repository contains no migrations; refusing production schema verification");
  }

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
    const repositoryByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
    const appliedByVersion = new Map<number, { filename: string; sha256: string }>();
    const failures: string[] = [];

    for (const row of applied.rows as Array<{ version: number | string; filename: string; sha256: string }>) {
      const version = Number(row.version);
      const filename = String(row.filename);
      const sha256 = String(row.sha256).trim();
      appliedByVersion.set(version, { filename, sha256 });

      const repositoryMigration = repositoryByVersion.get(version);
      if (!repositoryMigration) {
        failures.push(`Production has migration ${version} (${filename}) that is absent from this repository revision`);
        continue;
      }
      if (repositoryMigration.filename !== filename) {
        failures.push(
          `Migration ${version} filename mismatch: repository=${repositoryMigration.filename}, production=${filename}`,
        );
      }
      if (repositoryMigration.sha256 !== sha256) {
        failures.push(
          `Migration ${version} checksum mismatch: repository=${repositoryMigration.sha256}, production=${sha256}`,
        );
      }
    }

    for (const migration of migrations) {
      if (!appliedByVersion.has(migration.version)) {
        failures.push(`Production is missing repository migration ${migration.filename}`);
      }
    }

    if (failures.length > 0) {
      const repositoryHead = migrations.at(-1)!;
      const productionHeadRow = applied.rows.at(-1) as
        | { version: number | string; filename: string; sha256: string }
        | undefined;
      const productionHead = productionHeadRow
        ? `${String(productionHeadRow.version).padStart(4, "0")} ${productionHeadRow.filename}`
        : "none";
      throw new Error(
        [
          "Production schema drift detected; deployment is blocked.",
          `Repository head: ${String(repositoryHead.version).padStart(4, "0")} ${repositoryHead.filename}`,
          `Production head: ${productionHead}`,
          ...failures.map((failure) => `- ${failure}`),
          "Apply the repository migrations to production first, then redeploy the same commit.",
        ].join("\n"),
      );
    }

    const head = migrations.at(-1)!;
    console.log(
      `Production schema gate OK: ${migrations.length} migrations match through ${String(head.version).padStart(4, "0")} ${head.filename}.`,
    );
  } finally {
    await pool.end();
  }
}

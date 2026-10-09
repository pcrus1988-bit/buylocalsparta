import { readFile, readdir } from "node:fs/promises";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const postcheck = process.argv.includes("--postcheck");
const expectedSourceVersion = 436;
const expectedCurrentVersion = 434;

const registry = JSON.parse(
  await readFile(new URL("../data/nyxi/source-registry.json", import.meta.url), "utf8")
) as { version?: number; sources?: Array<{ sourceKey?: string; canonicalUrl?: string }> };
if (registry.version !== 25 || !Array.isArray(registry.sources)) {
  throw new Error("NYXI rollout requires canonical source registry v25");
}
const expectedSources = registry.sources.length;
if (expectedSources !== 282) {
  throw new Error(`NYXI rollout expects 282 canonical sources; registry contains ${expectedSources}`);
}
const sourceKeys = new Set(registry.sources.map((source) => source.sourceKey));
const sourceUrls = new Set(registry.sources.map((source) => source.canonicalUrl));
if (sourceKeys.size !== expectedSources || sourceUrls.size !== expectedSources) {
  throw new Error("NYXI registry contains duplicate source keys or canonical URLs");
}

const requiredRelations = [
  "nyxi_sources",
  "nyxi_source_snapshots",
  "nyxi_source_crawl_state",
  "nyxi_research_targets",
  "nyxi_source_target_links",
  "nyxi_source_candidates",
  "nyxi_source_checks",
  "nyxi_source_candidate_snapshots",
  "nyxi_source_candidate_checks",
  "nyxi_corpus_manifest",
  "nyxi_workbench_sources",
  "nyxi_workbench_snapshots",
  "nyxi_workbench_review_queue"
] as const;

const migrationNames = (await readdir(new URL("../db/migrations/", import.meta.url)))
  .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(name))
  .sort();
const sourceHead = migrationNames.length
  ? Number(migrationNames[migrationNames.length - 1]!.slice(0, 4))
  : 0;
if (sourceHead !== expectedSourceVersion) {
  throw new Error(
    `NYXI schema rollout is pinned to source head ${expectedSourceVersion}; repository head is ${sourceHead}. Re-review before applying newer migrations.`
  );
}

const pgModule = await import("pg");
const Pool = pgModule.Pool ?? pgModule.default?.Pool;
if (!Pool) throw new Error("Unable to load pg.Pool");

const pool = new Pool({
  connectionString,
  max: 1,
  application_name: postcheck ? "nyxi-corpus-schema-postcheck" : "nyxi-corpus-schema-preflight",
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
});

try {
  const result = await pool.query(`
    SELECT
      COALESCE((SELECT MAX(version) FROM public.schema_migrations),0)::int AS schema_version,
      ${requiredRelations.map((name, index) => `to_regclass('public.${name}')::text AS relation_${index}`).join(",\n      ")}
  `);
  const row = result.rows[0] ?? {};
  const schemaVersion = Number(row.schema_version ?? 0);
  const present = requiredRelations.filter((_name, index) => Boolean(row[`relation_${index}`]));
  const missing = requiredRelations.filter((_name, index) => !row[`relation_${index}`]);

  const ledgerResult = await pool.query("SELECT version, filename FROM public.schema_migrations ORDER BY version");
  const ledgerByVersion = new Map<number, string>(
    ledgerResult.rows.map((entry: { version: number | string; filename: string }) => [Number(entry.version), entry.filename])
  );
  const canonicalLedgerGaps = migrationNames.filter((filename) => {
    const version = Number(filename.slice(0, 4));
    return ledgerByVersion.get(version) !== filename;
  });

  if (postcheck) {
    if (schemaVersion !== expectedSourceVersion) {
      throw new Error(`Postcheck expected schema ${expectedSourceVersion}; database reports ${schemaVersion}`);
    }
    if (missing.length) {
      throw new Error(`Postcheck missing NYXI relations: ${missing.join(", ")}`);
    }
    if (canonicalLedgerGaps.length) {
      throw new Error(`Postcheck canonical migration ledger is incomplete or mismatched: ${canonicalLedgerGaps.join(", ")}`);
    }
    const counts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM public.nyxi_sources) AS sources,
        (SELECT count(*)::int FROM public.nyxi_source_crawl_state) AS crawl_states,
        (SELECT count(*)::int FROM public.nyxi_corpus_manifest) AS manifest_rows
    `);
    const countRow = counts.rows[0] ?? {};
    for (const field of ["sources", "crawl_states", "manifest_rows"] as const) {
      if (Number(countRow[field] ?? -1) !== expectedSources) {
        throw new Error(`NYXI postcheck expected ${expectedSources} ${field}; found ${countRow[field]}`);
      }
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "postcheck",
      schemaVersion,
      registryVersion: registry.version,
      sources: expectedSources,
      requiredRelations: requiredRelations.length
    }));
  } else if (schemaVersion === expectedSourceVersion) {
    if (missing.length) {
      throw new Error(`Schema is already ${expectedSourceVersion} but NYXI relations are incomplete: ${missing.join(", ")}`);
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight",
      state: "already_applied",
      schemaVersion,
      registryVersion: registry.version,
      sources: expectedSources
    }));
  } else {
    if (schemaVersion !== expectedCurrentVersion) {
      throw new Error(
        `NYXI rollout requires clean schema ${expectedCurrentVersion} or already-applied ${expectedSourceVersion}; database reports ${schemaVersion}`
      );
    }
    if (present.length) {
      throw new Error(
        `Schema is ${expectedCurrentVersion} but NYXI relations already exist: ${present.join(", ")}. Refusing a partial-state rollout.`
      );
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight",
      state: "clean_upgrade",
      schemaVersion,
      targetVersion: expectedSourceVersion,
      registryVersion: registry.version,
      sources: expectedSources,
      pendingCanonicalMigrations: canonicalLedgerGaps.length
    }));
  }
} finally {
  await pool.end();
}

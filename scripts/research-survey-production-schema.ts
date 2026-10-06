import { readdir } from "node:fs/promises";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const postcheck = process.argv.includes("--postcheck");
const expectedSourceVersion = 434;
const expectedCurrentVersion = 415;
const requiredTables = [
  "research_programmes",
  "research_studies",
  "research_waves",
  "research_instruments",
  "research_responses",
  "research_contact_suppression_events",
  "research_participant_deliveries",
  "research_invite_access_tokens",
  "research_invite_messages",
  "research_analysis_plans",
  "research_sample_designs",
  "research_sample_design_strata",
  "research_protocol_events",
  "research_population_margin_sets",
  "research_population_margins",
  "research_analysis_plan_supersessions",
  "research_variable_definitions",
  "research_variable_versions",
  "research_question_lineage",
  "research_harmonisation_rules",
  "research_longitudinal_comparison_specs",
  "research_release_archives"
] as const;

const migrationNames = (await readdir(new URL("../db/migrations/", import.meta.url)))
  .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(name))
  .sort();
const sourceHead = migrationNames.length
  ? Number(migrationNames[migrationNames.length - 1]!.slice(0, 4))
  : 0;
if (sourceHead !== expectedSourceVersion) {
  throw new Error(
    `Research schema rollout is pinned to source head ${expectedSourceVersion}; repository head is ${sourceHead}. Re-review the rollout before applying newer migrations.`
  );
}

const pgModule = await import("pg");
const Pool = pgModule.Pool ?? pgModule.default?.Pool;
if (!Pool) throw new Error("Unable to load pg.Pool");

const pool = new Pool({
  connectionString,
  max: 1,
  application_name: postcheck
    ? "kontamou-research-schema-postcheck"
    : "kontamou-research-schema-preflight",
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
});

try {
  const result = await pool.query(`
    SELECT
      COALESCE((SELECT MAX(version) FROM public.schema_migrations),0)::int AS schema_version,
      ${requiredTables.map((table, index) => `to_regclass('public.${table}')::text AS table_${index}`).join(",\n      ")}
  `);
  const row = result.rows[0] ?? {};
  const schemaVersion = Number(row.schema_version ?? 0);
  const present = requiredTables.filter((_table, index) => Boolean(row[`table_${index}`]));
  const missing = requiredTables.filter((_table, index) => !row[`table_${index}`]);

  if (postcheck) {
    if (schemaVersion !== expectedSourceVersion) {
      throw new Error(`Postcheck expected schema ${expectedSourceVersion}; database reports ${schemaVersion}`);
    }
    if (missing.length) {
      throw new Error(`Postcheck missing research tables: ${missing.join(", ")}`);
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "postcheck",
      schemaVersion,
      requiredTables: requiredTables.length
    }));
  } else if (schemaVersion === expectedSourceVersion) {
    if (missing.length) {
      throw new Error(`Schema is already ${expectedSourceVersion} but research tables are incomplete: ${missing.join(", ")}`);
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight",
      state: "already_applied",
      schemaVersion,
      requiredTables: requiredTables.length
    }));
  } else {
    if (schemaVersion !== expectedCurrentVersion) {
      throw new Error(
        `Research rollout requires clean schema ${expectedCurrentVersion} or already-applied ${expectedSourceVersion}; database reports ${schemaVersion}`
      );
    }
    if (present.length) {
      throw new Error(
        `Schema is ${expectedCurrentVersion} but research tables already exist: ${present.join(", ")}. Refusing a partial-state rollout.`
      );
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "preflight",
      state: "clean_upgrade",
      schemaVersion,
      targetVersion: expectedSourceVersion
    }));
  }
} finally {
  await pool.end();
}

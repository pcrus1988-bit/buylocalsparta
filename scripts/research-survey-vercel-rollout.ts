import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";

const EXPECTED_SOURCE_HEAD = 434;
const EXPECTED_PRODUCTION_HEAD = 415;
const EXPECTED_PENDING_VERSIONS = new Set([
  334,
  ...Array.from({ length: 19 }, (_value, index) => 416 + index)
]);

if (process.env.VERCEL_ENV !== "production") {
  console.log(`Research one-shot rollout skipped for VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}.`);
  process.exit(0);
}
if (process.env.BLS_RESEARCH_SCHEMA_APPLY_ONCE !== "true") {
  console.log("Research one-shot rollout is not enabled; no database mutation requested.");
  process.exit(0);
}

const migrationNames = (await readdir(new URL("../db/migrations/", import.meta.url)))
  .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(name))
  .sort();
const repositoryHead = migrationNames.length
  ? Number(migrationNames[migrationNames.length - 1]!.slice(0, 4))
  : 0;
if (repositoryHead !== EXPECTED_SOURCE_HEAD) {
  throw new Error(`One-shot Research rollout requires repository schema head ${EXPECTED_SOURCE_HEAD}; found ${repositoryHead}`);
}

run("npm", ["run", "db:verify"], process.env);

const preflight = runAndParseJson(
  "node",
  ["--experimental-strip-types", "scripts/research-survey-production-schema.ts", "--vercel-production-only"],
  process.env
);
if (preflight?.mode !== "preflight"
    || preflight?.state !== "clean_upgrade"
    || Number(preflight?.schemaVersion) !== EXPECTED_PRODUCTION_HEAD
    || Number(preflight?.targetVersion) !== EXPECTED_SOURCE_HEAD) {
  throw new Error(`Research production preflight did not report the required clean ${EXPECTED_PRODUCTION_HEAD} -> ${EXPECTED_SOURCE_HEAD} state`);
}

const pendingFiles = Array.isArray(preflight?.pendingCanonicalMigrationFiles)
  ? preflight.pendingCanonicalMigrationFiles.map(String)
  : [];
const pendingVersions = new Set(pendingFiles.map((filename) => Number(filename.slice(0, 4))));
if (pendingVersions.size !== EXPECTED_PENDING_VERSIONS.size
    || [...EXPECTED_PENDING_VERSIONS].some((version) => !pendingVersions.has(version))) {
  throw new Error(
    `Research rollout expected missing migrations 0334 plus 0416-0434; preflight reported: ${pendingFiles.join(", ") || "none"}`
  );
}

const resolvedDatabaseUrl = resolveProductionDatabaseUrl(process.env);
if (!resolvedDatabaseUrl) {
  throw new Error("One-shot Research rollout could not resolve DATABASE_URL, POSTGRES_URL_NON_POOLING, or POSTGRES_URL");
}
const childEnv = { ...process.env, DATABASE_URL: resolvedDatabaseUrl };

run("npm", ["run", "db:migrate"], childEnv);

const postcheck = runAndParseJson(
  "node",
  ["--experimental-strip-types", "scripts/research-survey-production-schema.ts", "--postcheck"],
  childEnv
);
if (postcheck?.mode !== "postcheck"
    || Number(postcheck?.schemaVersion) !== EXPECTED_SOURCE_HEAD
    || (Array.isArray(postcheck?.pendingCanonicalMigrations) && postcheck.pendingCanonicalMigrations.length > 0)) {
  throw new Error("Research postcheck did not confirm canonical schema head 0434 with a complete migration ledger");
}

run("npm", ["run", "db:ready"], childEnv);

console.log(JSON.stringify({
  ok: true,
  mode: "vercel_one_shot_research_rollout",
  from: EXPECTED_PRODUCTION_HEAD,
  to: EXPECTED_SOURCE_HEAD,
  appliedCanonicalMigrations: pendingFiles
}));

function run(command: string, args: string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
  return result.stdout ?? "";
}

function runAndParseJson(command: string, args: string[], env: NodeJS.ProcessEnv): any {
  const stdout = run(command, args, env);
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]!);
    } catch {
      // Keep scanning for the final structured status line.
    }
  }
  throw new Error(`No structured JSON status emitted by ${command} ${args.join(" ")}`);
}

function resolveProductionDatabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit) return explicit;
  const direct = env.POSTGRES_URL_NON_POOLING?.trim();
  const marketplace = direct || env.POSTGRES_URL?.trim();
  if (!marketplace) return undefined;
  try {
    const url = new URL(marketplace);
    const hostname = url.hostname.toLowerCase();
    if (hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.com")) {
      url.searchParams.set("sslmode", "no-verify");
    }
    return url.toString();
  } catch {
    return marketplace;
  }
}

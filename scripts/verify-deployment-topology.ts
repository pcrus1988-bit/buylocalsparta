import { readFile, stat } from "node:fs/promises";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const web = JSON.parse(await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"));
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const entrypoint = await readFile(new URL("../deploy/worker-entrypoint.sh", import.meta.url), "utf8");
const dockerfile = await readFile(new URL("../deploy/worker.Dockerfile", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/DEPLOYMENT_TOPOLOGY.md", import.meta.url), "utf8");
const crawlerDocs = await readFile(new URL("../docs/CATALOG_CRAWLER_WORKER.md", import.meta.url), "utf8");
const nextConfig = await readFile(new URL("../apps/web/next.config.ts", import.meta.url), "utf8");
const productionCi = await readFile(new URL("../.github/workflows/production-ci.yml", import.meta.url), "utf8");
const stagingActivation = await readFile(new URL("../.github/workflows/staging-activation.yml", import.meta.url), "utf8");
const stagingEvidence = await readFile(new URL("../.github/workflows/staging-scenario-evidence.yml", import.meta.url), "utf8");
const productionSchemaGate = await readFile(new URL("./verify-production-schema-head.ts", import.meta.url), "utf8");
const productionSchemaHealth = await readFile(new URL("../apps/web/src/app/api/health/schema/route.ts", import.meta.url), "utf8");

assert(root.packageManager === "npm@10.9.2", "root packageManager must stay pinned for Vercel workspace detection");
assert(root.engines?.node === ">=24 <25", "root must require Node 24");
assert(web.type === "module", "web workspace must be ESM for direct Node type-stripping verification");
await stat(new URL("../package-lock.json", import.meta.url));
assert(vercel.framework === "nextjs", "Vercel framework must be Next.js");
assert(vercel.installCommand === "npm ci --ignore-scripts", "source-controlled Vercel install must consume the committed root lockfile");
assert(vercel.buildCommand === "npm ci --ignore-scripts && npm --workspace @buy-local-sparta/web run build", "Vercel build must reassert the locked graph before building the web workspace");
assert(vercel.outputDirectory === "apps/web/.next", "Vercel output must point at the workspace .next directory");
const vercelCrons = Array.isArray(vercel.crons) ? vercel.crons : [];
assert(
  vercelCrons.every((cron: Record<string, unknown>) => cron.path === "/api/cron/delivery-dispatch" && cron.schedule === "* * * * *"),
  "Vercel cron jobs are limited to the bounded delivery dispatch endpoint; long-running BLS workers must remain isolated",
);
assert(vercelCrons.filter((cron: Record<string, unknown>) => cron.path === "/api/cron/delivery-dispatch").length <= 1, "delivery dispatch cron must not be duplicated");
assert(
  web.scripts?.prebuild?.includes("verify-production-schema-head.ts --vercel-production-only"),
  "production Vercel prebuild must enforce the repository/production migration head gate",
);
assert(productionSchemaGate.includes("public.schema_migrations"), "production schema gate must read the migration ledger directly when DATABASE_URL is available");
assert(productionSchemaGate.includes("/api/health/schema"), "Vercel production schema gate must verify through the deployed runtime when build-time DATABASE_URL is unavailable");
assert(productionSchemaGate.includes("ledgerFingerprint"), "production schema gate must compare the full immutable migration-ledger fingerprint");
assert(productionSchemaGate.includes("migrations.at(-1)!.version === 115"), "legacy readiness bootstrap must be permanently capped at schema 115");
assert(productionSchemaGate.includes("deployment is blocked"), "production schema gate must fail closed on drift");
assert(productionSchemaHealth.includes("SELECT version, filename, sha256 FROM public.schema_migrations ORDER BY version"), "schema health endpoint must fingerprint the complete ordered application migration ledger");
assert(productionSchemaHealth.includes("schema-ledger-v1"), "schema health endpoint must use the versioned ledger fingerprint contract");
assert(productionSchemaHealth.includes('"Cache-Control": "no-store"'), "schema health endpoint must never be cached");
assert(!productionSchemaHealth.includes("connectionString") && !productionSchemaHealth.includes("DATABASE_URL"), "schema health endpoint must not expose database credentials");
for (const workflow of [productionCi, stagingActivation, stagingEvidence]) {
  assert(workflow.includes("npm ci --ignore-scripts"), "release/staging workflows must consume the committed npm lockfile");
  assert(!workflow.includes("npm install --ignore-scripts"), "release/staging workflows must not re-resolve dependencies with npm install");
}
for (const role of ["postgres", "search", "notifications", "media", "reports", "crawler"]) assert(entrypoint.includes(`${role})`), `worker entrypoint is missing ${role} role`);
assert(entrypoint.includes("Unsupported BLS_WORKER_ROLE"), "worker entrypoint must fail closed on unknown roles");
assert(dockerfile.includes("FROM node:24-"), "worker container must run Node 24");
assert(dockerfile.includes("COPY package.json package-lock.json ./"), "worker image must copy the committed root lockfile before installing dependencies");
assert(dockerfile.includes("npm ci --omit=dev --ignore-scripts"), "worker image must install locked production workspace dependencies");
assert(!dockerfile.includes("npm install --omit=dev --ignore-scripts"), "worker image must not re-resolve production dependencies");
assert(docs.includes("repository root") && docs.includes("not `apps/web`"), "deployment runbook must document canonical Vercel root");
assert(docs.includes("npm ci --ignore-scripts"), "deployment runbook must document deterministic locked Vercel installs");
assert(docs.includes("dashboard Install Command override"), "deployment runbook must document the observed Vercel dashboard override and build-time lockfile guard");
assert(docs.includes("production schema gate"), "deployment runbook must document the hard production schema gate");
assert(docs.includes("schema-ledger fingerprint"), "deployment runbook must document Vercel's runtime schema-fingerprint verification path");
assert(docs.includes("BLS_WORKER_ROLE=postgres") && docs.includes("BLS_WORKER_ROLE=media") && docs.includes("BLS_WORKER_ROLE=reports"), "deployment runbook must document established independent worker roles");
assert(crawlerDocs.includes("BLS_WORKER_ROLE=crawler"), "crawler runbook must document the isolated worker role");
assert(crawlerDocs.includes("DNS") && crawlerDocs.includes("pinned"), "crawler runbook must document DNS pinning protection");
assert(crawlerDocs.includes("DATABASE_URL") && crawlerDocs.includes("BLS_CRAWLER_LEASE_SECONDS"), "crawler runbook must document worker database and lease configuration");
assert(crawlerDocs.includes("never become public products") || crawlerDocs.includes("never become") || crawlerDocs.includes("never become public"), "crawler runbook must preserve the staging/publication boundary");
assert(nextConfig.includes("outputFileTracingRoot"), "Next.js monorepo build must trace workspace files from repository root");
assert(nextConfig.includes("\"img-src 'self' data: blob: https:\""), "CSP must permit HTTPS catalogue source images after the product-detail source-host guard without hard-coding each supplier hostname");
assert(!nextConfig.includes("nikolaoutools.gr"), "CSP must not require supplier-specific image host deployments");

const mediaWeb = await readFile(new URL("../apps/web/src/lib/media-upload-service.ts", import.meta.url), "utf8");
const envMatrix = await readFile(new URL("../docs/DEPLOYMENT_ENVIRONMENT_MATRIX.md", import.meta.url), "utf8");
assert(!mediaWeb.includes("ClamAvScanner") && !mediaWeb.includes("clamAvConfigFromEnv"), "Vercel web media readiness must not depend on private ClamAV connectivity");
assert(!mediaWeb.includes("BLS_CLAMAV_HOST"), "Vercel media upload admission must not require the worker-only ClamAV host");
assert(envMatrix.includes("Do not put `BLS_CLAMAV_HOST` on Vercel"), "environment matrix must keep ClamAV credentials worker-only");
assert(envMatrix.includes("MEILISEARCH_ADMIN_KEY") && envMatrix.includes("search worker"), "environment matrix must isolate Meilisearch index-management credentials");
assert(envMatrix.includes("BLS_REPORT_ASYNC_ENABLED") && envMatrix.includes("reports` worker"), "environment matrix must document report worker split");
for (const path of [
  "../workers/postgres-worker.ts",
  "../workers/search-worker.ts",
  "../workers/notification-worker.ts",
  "../workers/media-worker.ts",
  "../workers/report-worker.ts",
  "../workers/catalog-crawler-worker.ts"
]) {
  await stat(new URL(path, import.meta.url));
}
console.log("Deployment topology OK: locked monorepo installs, source-agnostic HTTPS catalogue images, Vercel-safe immutable production schema gate, bounded delivery cron, web build and six isolated Node 24 worker roles verified.");

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

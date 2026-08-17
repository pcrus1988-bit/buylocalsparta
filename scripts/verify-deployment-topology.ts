import { readFile, stat } from "node:fs/promises";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const web = JSON.parse(await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"));
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const entrypoint = await readFile(new URL("../deploy/worker-entrypoint.sh", import.meta.url), "utf8");
const dockerfile = await readFile(new URL("../deploy/worker.Dockerfile", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/DEPLOYMENT_TOPOLOGY.md", import.meta.url), "utf8");
const nextConfig = await readFile(new URL("../apps/web/next.config.ts", import.meta.url), "utf8");

assert(root.packageManager === "npm@10.9.2", "root packageManager must stay pinned for Vercel workspace detection");
assert(root.engines?.node === ">=24 <25", "root must require Node 24");
assert(web.type === "module", "web workspace must be ESM for direct Node type-stripping verification");
assert(vercel.framework === "nextjs", "Vercel framework must be Next.js");
assert(vercel.installCommand === "npm install --ignore-scripts", "Vercel install must run from monorepo root");
assert(vercel.buildCommand === "npm --workspace @buy-local-sparta/web run build", "Vercel build must target the web workspace from root");
assert(vercel.outputDirectory === "apps/web/.next", "Vercel output must point at the workspace .next directory");
assert(!("crons" in vercel), "long-running BLS workers must not be disguised as Vercel cron jobs");
for (const role of ["postgres", "search", "notifications", "media"]) assert(entrypoint.includes(`${role})`), `worker entrypoint is missing ${role} role`);
assert(entrypoint.includes("Unsupported BLS_WORKER_ROLE"), "worker entrypoint must fail closed on unknown roles");
assert(dockerfile.includes("FROM node:24-"), "worker container must run Node 24");
assert(dockerfile.includes("npm install --omit=dev --ignore-scripts"), "worker image must install production workspace dependencies");
assert(docs.includes("repository root") && docs.includes("not `apps/web`"), "deployment runbook must document canonical Vercel root");
assert(docs.includes("BLS_WORKER_ROLE=postgres") && docs.includes("BLS_WORKER_ROLE=media"), "deployment runbook must document independent worker roles");
assert(nextConfig.includes("outputFileTracingRoot"), "Next.js monorepo build must trace workspace files from repository root");

const mediaWeb = await readFile(new URL("../apps/web/src/lib/media-upload-service.ts", import.meta.url), "utf8");
const envMatrix = await readFile(new URL("../docs/DEPLOYMENT_ENVIRONMENT_MATRIX.md", import.meta.url), "utf8");
assert(!mediaWeb.includes("ClamAvScanner") && !mediaWeb.includes("clamAvConfigFromEnv"), "Vercel web media readiness must not depend on private ClamAV connectivity");
assert(!mediaWeb.includes("BLS_CLAMAV_HOST"), "Vercel media upload admission must not require the worker-only ClamAV host");
assert(envMatrix.includes("Do not put `BLS_CLAMAV_HOST` on Vercel"), "environment matrix must keep ClamAV credentials worker-only");
assert(envMatrix.includes("MEILISEARCH_ADMIN_KEY") && envMatrix.includes("search worker"), "environment matrix must isolate Meilisearch index-management credentials");
for (const path of ["../workers/postgres-worker.ts", "../workers/search-worker.ts", "../workers/notification-worker.ts", "../workers/media-worker.ts"]) {
  await stat(new URL(path, import.meta.url));
}
console.log("Deployment topology OK: monorepo-root Vercel build + four isolated Node 24 worker roles verified.");

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

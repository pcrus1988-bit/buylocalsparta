import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("Nova catalogue sync remains an isolated typed worker", async () => {
  const [vercelText, entrypoint, dockerfile, workerEnv, runbook] = await Promise.all([
    readFile(new URL("../../../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../../../deploy/worker-entrypoint.sh", import.meta.url), "utf8"),
    readFile(new URL("../../../deploy/worker.Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../../../deploy/worker.env.example", import.meta.url), "utf8"),
    readFile(new URL("../../../docs/NOVA_CATALOGUE_WORKER.md", import.meta.url), "utf8")
  ]);
  const vercel = JSON.parse(vercelText) as { crons?: Array<{ path?: string }> };
  const cronPaths = (vercel.crons ?? []).map((cron) => cron.path);

  assert(!cronPaths.includes("/api/cron/nova-catalogue-sync"));
  assert(entrypoint.includes("nova-catalogue)"));
  assert(entrypoint.includes("workers/nova-catalogue-worker.ts"));
  assert(dockerfile.includes("COPY --chown=node:node integrations ./integrations"));
  assert(workerEnv.includes("BLS_WORKER_ROLE=nova-catalogue"));
  assert(workerEnv.includes("NOVA_API_KEY="));
  assert(runbook.includes("must not run as a Vercel request/response function or Vercel Cron job"));
  assert(runbook.includes("regular_price` is MSRP/RRP"));
  assert(runbook.includes("sale_price` is KONTA MOY's supplier buying cost"));
  assert(runbook.includes("does not call `POST /orders`"));

  await stat(new URL("../../../workers/nova-catalogue-worker.ts", import.meta.url));
  await assert.rejects(stat(new URL("../../../apps/web/src/app/api/cron/nova-catalogue-sync/route.ts", import.meta.url)));

  execFileSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--noEmit",
    "--target", "ES2022",
    "--module", "ESNext",
    "--moduleResolution", "Bundler",
    "--allowImportingTsExtensions",
    "--skipLibCheck",
    "workers/nova-catalogue-worker.ts"
  ], {
    cwd: new URL("../../../", import.meta.url),
    stdio: "pipe"
  });
});

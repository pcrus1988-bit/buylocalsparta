import { spawn, type ChildProcess } from "node:child_process";

type WorkerName = "nova-catalogue" | "symphonya";

type RunningWorker = Readonly<{
  name: WorkerName;
  child: ChildProcess;
  done: Promise<Readonly<{ name: WorkerName; code: number | null; signal: NodeJS.Signals | null }>>;
}>;

const nodeArgs = [
  "--experimental-strip-types",
  "--loader",
  "./scripts/resolve-typescript-extension.mjs"
];

function startWorker(name: WorkerName, path: string): RunningWorker {
  const child = spawn(process.execPath, [...nodeArgs, path], {
    env: process.env,
    stdio: "inherit"
  });

  const done = new Promise<Readonly<{ name: WorkerName; code: number | null; signal: NodeJS.Signals | null }>>((resolve) => {
    child.once("exit", (code, signal) => resolve({ name, code, signal }));
  });

  return { name, child, done };
}

const nova = startWorker("nova-catalogue", "workers/nova-catalogue-worker.ts");
const symphonya = startWorker("symphonya", "workers/symphonya-worker.ts");
const workers = [nova, symphonya] as const;

let stopping = false;
const requestStop = (signal: NodeJS.Signals) => {
  if (stopping) return;
  stopping = true;
  console.info(JSON.stringify({
    level: "info",
    event: "catalogue_supplier_supervisor.shutdown_requested",
    at: new Date().toISOString(),
    signal
  }));
  for (const worker of workers) {
    if (!worker.child.killed) worker.child.kill("SIGTERM");
  }
};

process.once("SIGTERM", () => requestStop("SIGTERM"));
process.once("SIGINT", () => requestStop("SIGINT"));

const first = await Promise.race(workers.map((worker) => worker.done));

if (!stopping) {
  console.error(JSON.stringify({
    level: "error",
    event: "catalogue_supplier_supervisor.worker_exited",
    at: new Date().toISOString(),
    worker: first.name,
    code: first.code,
    signal: first.signal
  }));
  stopping = true;
  for (const worker of workers) {
    if (worker.name !== first.name && !worker.child.killed) worker.child.kill("SIGTERM");
  }
}

await Promise.allSettled(workers.map((worker) => worker.done));

if (first.signal && first.signal !== "SIGTERM" && first.signal !== "SIGINT") {
  process.exitCode = 1;
} else if (!stopping || (first.code !== null && first.code !== 0)) {
  process.exitCode = first.code ?? 1;
}

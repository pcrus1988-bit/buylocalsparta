import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runSymphonyaAutoPublicationSweep } from "../apps/web/src/lib/symphonya-auto-publication-runtime.ts";
import { runSymphonyaStockSyncSlice } from "../apps/web/src/lib/symphonya-stock-sync-runtime.ts";

const MAX_STOCK_SLICES = 80;
const MAX_PUBLICATION_SWEEPS = 30;
const BUSY_RETRY_MS = 5_000;

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  if (!process.env.SYMPHONYA_API_KEY?.trim()) {
    throw new Error("SYMPHONYA_API_KEY is required");
  }

  const readiness = await productionDatabaseReadiness();
  if (!readiness.ok) {
    throw new Error(`Symphonya stock worker database not ready: ${readiness.message}`);
  }

  let cycleComplete = false;
  let claimedSlices = 0;
  let totalPages = 0;
  let totalRows = 0;
  let totalOffersUpdated = 0;

  for (let slice = 1; slice <= MAX_STOCK_SLICES; slice += 1) {
    const startedAt = Date.now();
    const result = await runSymphonyaStockSyncSlice({
      maxDurationMs: 28_000,
      maxPages: 20
    });

    log("info", "symphonya.stock_actions_slice_completed", {
      slice,
      durationMs: Date.now() - startedAt,
      ...result
    });

    if (!result.claimed) {
      await delay(BUSY_RETRY_MS);
      continue;
    }

    claimedSlices += 1;
    totalPages += result.pages;
    totalRows += result.rows;
    totalOffersUpdated += result.offersUpdated;

    if (result.cycleComplete) {
      cycleComplete = true;
      break;
    }
  }

  if (!cycleComplete) {
    throw new Error(
      `SYMPHONYA_STOCK_CYCLE_INCOMPLETE after ${MAX_STOCK_SLICES} slices; claimed=${claimedSlices}, pages=${totalPages}, rows=${totalRows}`
    );
  }

  let totalPublished = 0;
  let publicationSweeps = 0;

  for (let sweep = 1; sweep <= MAX_PUBLICATION_SWEEPS; sweep += 1) {
    const startedAt = Date.now();
    const result = await runSymphonyaAutoPublicationSweep();
    publicationSweeps = sweep;
    totalPublished += result.published;

    log("info", "symphonya.publication_actions_sweep_completed", {
      sweep,
      durationMs: Date.now() - startedAt,
      ...result
    });

    if (result.published === 0) break;
  }

  log("info", "symphonya.stock_actions_completed", {
    claimedSlices,
    totalPages,
    totalRows,
    totalOffersUpdated,
    publicationSweeps,
    totalPublished
  });
}

try {
  await main();
} catch (error) {
  log("error", "symphonya.stock_actions_failed", { error: safeError(error) });
  process.exitCode = 1;
} finally {
  await getProductionPostgresRuntime().close();
}

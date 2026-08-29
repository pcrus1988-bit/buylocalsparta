import type { OpenIcecatIndexEntry } from "./types.ts";

export type OpenIcecatImportKind = "full" | "daily";

export const OPEN_ICECAT_BULK_PROCESSING_VERSION = "open-icecat-bulk-v1";

export type OpenIcecatBulkRunIdentity = Readonly<{
  sourceId: string;
  importKind: OpenIcecatImportKind;
  sourceUrl: string;
  sourceFingerprint: string;
  processingVersion: string;
}>;

export type OpenIcecatBulkRunInputIdentity = Readonly<
  Omit<OpenIcecatBulkRunIdentity, "processingVersion"> & {
    processingVersion?: string;
  }
>;

export type OpenIcecatBulkRunState = Readonly<
  OpenIcecatBulkRunIdentity & {
    runId: string;
    checkpoint: number;
    completed: boolean;
    persisted: number;
    removed: number;
  }
>;

export type OpenIcecatBulkBatch = Readonly<{
  runId: string;
  checkpoint: number;
  candidates: readonly OpenIcecatIndexEntry[];
  removals: readonly OpenIcecatIndexEntry[];
}>;

export interface OpenIcecatBulkRepository {
  beginOrResume(identity: OpenIcecatBulkRunIdentity): Promise<OpenIcecatBulkRunState>;
  /**
   * Persist the batch effects and its checkpoint atomically in one storage transaction.
   * If this call rejects, neither the candidate/removal effects nor the checkpoint may
   * remain committed. The runner relies on that invariant to replay safely after failure.
   */
  commitBatch(batch: OpenIcecatBulkBatch): Promise<void>;
  complete(runId: string, checkpoint: number): Promise<void>;
  fail(runId: string, error: string): Promise<void>;
}

export type OpenIcecatBulkRunResult = Readonly<{
  runId: string;
  resumedFrom: number;
  checkpoint: number;
  completed: boolean;
  candidates: number;
  removals: number;
}>;

export async function runOpenIcecatBulkImport(input: Readonly<{
  identity: OpenIcecatBulkRunInputIdentity;
  entries: AsyncIterable<OpenIcecatIndexEntry>;
  repository: OpenIcecatBulkRepository;
  batchSize?: number;
}>): Promise<OpenIcecatBulkRunResult> {
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? 500));
  const identity = normalizeRunIdentity(input.identity);
  const state = await input.repository.beginOrResume(identity);
  assertResumeIdentity(state, identity);

  if (state.completed) {
    return {
      runId: state.runId,
      resumedFrom: state.checkpoint,
      checkpoint: state.checkpoint,
      completed: true,
      candidates: 0,
      removals: 0
    };
  }

  let recordIndex = 0;
  let checkpoint = state.checkpoint;
  let candidateCount = 0;
  let removalCount = 0;
  let candidates: OpenIcecatIndexEntry[] = [];
  let removals: OpenIcecatIndexEntry[] = [];

  const commit = async (): Promise<void> => {
    if (!candidates.length && !removals.length) return;
    await input.repository.commitBatch({
      runId: state.runId,
      checkpoint,
      candidates,
      removals
    });
    candidates = [];
    removals = [];
  };

  try {
    for await (const entry of input.entries) {
      recordIndex += 1;
      if (recordIndex <= state.checkpoint) continue;
      checkpoint = recordIndex;
      if (identity.importKind === "daily" && entry.quality?.toUpperCase() === "REMOVED") {
        removals.push(entry);
        removalCount += 1;
      } else {
        candidates.push(entry);
        candidateCount += 1;
      }
      if (candidates.length + removals.length >= batchSize) await commit();
    }
    await commit();
    await input.repository.complete(state.runId, checkpoint);
    return {
      runId: state.runId,
      resumedFrom: state.checkpoint,
      checkpoint,
      completed: true,
      candidates: candidateCount,
      removals: removalCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await input.repository.fail(state.runId, message);
    } catch {
      // Preserve the import failure as the primary error even when audit persistence fails.
    }
    throw error;
  }
}

function normalizeRunIdentity(identity: OpenIcecatBulkRunInputIdentity): OpenIcecatBulkRunIdentity {
  const processingVersion = identity.processingVersion?.trim() || OPEN_ICECAT_BULK_PROCESSING_VERSION;
  for (const [field, value] of [
    ["sourceId", identity.sourceId],
    ["sourceUrl", identity.sourceUrl],
    ["sourceFingerprint", identity.sourceFingerprint],
    ["processingVersion", processingVersion]
  ] as const) {
    if (!value.trim()) throw new Error(`Open Icecat bulk identity ${field} must not be empty.`);
  }
  return { ...identity, processingVersion };
}

function assertResumeIdentity(state: OpenIcecatBulkRunState, identity: OpenIcecatBulkRunIdentity): void {
  const fields = ["sourceId", "importKind", "sourceUrl", "sourceFingerprint", "processingVersion"] as const;
  for (const field of fields) {
    if (state[field] !== identity[field]) {
      throw new Error(
        `Open Icecat bulk resume identity mismatch for ${field}: stored=${state[field]} requested=${identity[field]}.`
      );
    }
  }
  if (!Number.isSafeInteger(state.checkpoint) || state.checkpoint < 0) {
    throw new Error(`Open Icecat bulk resume checkpoint is invalid: ${state.checkpoint}.`);
  }
}

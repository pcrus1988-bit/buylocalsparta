import type { OpenIcecatIndexEntry, OpenIcecatIndexSourceEvent } from "./types.ts";

export type OpenIcecatImportKind = "full" | "daily";

export const OPEN_ICECAT_BULK_PROCESSING_VERSION = "open-icecat-bulk-v2-source-rows";

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
    /** Number of terminal source records durably completed. */
    checkpoint: number;
    completed: boolean;
    persisted: number;
    removed: number;
    rejected: number;
    filtered: number;
  }
>;

export type OpenIcecatBulkBatch = Readonly<{
  runId: string;
  /** Next source offset to process after this transaction commits. */
  checkpoint: number;
  sourceRows: number;
  candidates: readonly OpenIcecatIndexEntry[];
  removals: readonly OpenIcecatIndexEntry[];
  rejected: number;
  filtered: number;
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
  sourceRows: number;
  candidates: number;
  removals: number;
  rejected: number;
  filtered: number;
}>;

/**
 * Runs a resumable bulk import over terminal source-row events. The durable
 * checkpoint is a source-record cursor, never an accepted-entry counter.
 * Rejected and filtered records therefore advance progress, while a failed
 * batch leaves its rows to be replayed on the next resume.
 */
export async function runOpenIcecatBulkImport(input: Readonly<{
  identity: OpenIcecatBulkRunInputIdentity;
  events: AsyncIterable<OpenIcecatIndexSourceEvent>;
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
      sourceRows: 0,
      candidates: 0,
      removals: 0,
      rejected: 0,
      filtered: 0
    };
  }

  let checkpoint = state.checkpoint;
  let sourceRowCount = 0;
  let candidateCount = 0;
  let removalCount = 0;
  let rejectedCount = 0;
  let filteredCount = 0;

  let batchSourceRows = 0;
  let batchRejected = 0;
  let batchFiltered = 0;
  let candidates: OpenIcecatIndexEntry[] = [];
  let removals: OpenIcecatIndexEntry[] = [];

  const commit = async (): Promise<void> => {
    if (batchSourceRows === 0) return;
    await input.repository.commitBatch({
      runId: state.runId,
      checkpoint,
      sourceRows: batchSourceRows,
      candidates,
      removals,
      rejected: batchRejected,
      filtered: batchFiltered
    });
    batchSourceRows = 0;
    batchRejected = 0;
    batchFiltered = 0;
    candidates = [];
    removals = [];
  };

  try {
    for await (const event of input.events) {
      assertSourceOffset(event.sourceOffset);
      if (event.sourceOffset < state.checkpoint) continue;
      if (event.sourceOffset !== checkpoint) {
        throw new Error(`Open Icecat source-row gap: expected offset ${checkpoint}, received ${event.sourceOffset}.`);
      }

      if (event.kind === "rejected") {
        rejectedCount += 1;
        batchRejected += 1;
      } else if (event.kind === "filtered") {
        filteredCount += 1;
        batchFiltered += 1;
      } else if (identity.importKind === "daily" && event.entry.quality?.toUpperCase() === "REMOVED") {
        removals.push(event.entry);
        removalCount += 1;
      } else {
        candidates.push(event.entry);
        candidateCount += 1;
      }

      checkpoint = event.sourceOffset + 1;
      sourceRowCount += 1;
      batchSourceRows += 1;

      if (batchSourceRows >= batchSize) await commit();
    }

    await commit();
    await input.repository.complete(state.runId, checkpoint);
    return {
      runId: state.runId,
      resumedFrom: state.checkpoint,
      checkpoint,
      completed: true,
      sourceRows: sourceRowCount,
      candidates: candidateCount,
      removals: removalCount,
      rejected: rejectedCount,
      filtered: filteredCount
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

function assertSourceOffset(sourceOffset: number): void {
  if (!Number.isSafeInteger(sourceOffset) || sourceOffset < 0) {
    throw new Error(`Open Icecat source-row offset is invalid: ${sourceOffset}.`);
  }
}

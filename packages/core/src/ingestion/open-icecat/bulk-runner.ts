import type { OpenIcecatIndexEntry } from "./types.ts";

export type OpenIcecatImportKind = "full" | "daily";

export type OpenIcecatBulkRunState = Readonly<{
  runId: string;
  checkpoint: number;
  completed: boolean;
  persisted: number;
  removed: number;
}>;

export type OpenIcecatBulkRunIdentity = Readonly<{
  sourceId: string;
  importKind: OpenIcecatImportKind;
  sourceUrl: string;
  sourceFingerprint: string;
}>;

export type OpenIcecatBulkBatch = Readonly<{
  runId: string;
  checkpoint: number;
  candidates: readonly OpenIcecatIndexEntry[];
  removals: readonly OpenIcecatIndexEntry[];
}>;

export interface OpenIcecatBulkRepository {
  beginOrResume(identity: OpenIcecatBulkRunIdentity): Promise<OpenIcecatBulkRunState>;
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
  identity: OpenIcecatBulkRunIdentity;
  entries: AsyncIterable<OpenIcecatIndexEntry>;
  repository: OpenIcecatBulkRepository;
  batchSize?: number;
}>): Promise<OpenIcecatBulkRunResult> {
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? 500));
  const state = await input.repository.beginOrResume(input.identity);
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
      if (input.identity.importKind === "daily" && entry.quality?.toUpperCase() === "REMOVED") {
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
    await input.repository.fail(state.runId, message);
    throw error;
  }
}

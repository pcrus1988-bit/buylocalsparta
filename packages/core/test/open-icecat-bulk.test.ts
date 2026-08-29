import test from "node:test";
import assert from "node:assert/strict";
import {
  OPEN_ICECAT_BULK_PROCESSING_VERSION,
  parseOpenIcecatIndexStream,
  runOpenIcecatBulkImport,
  type OpenIcecatBulkBatch,
  type OpenIcecatBulkRepository,
  type OpenIcecatBulkRunIdentity,
  type OpenIcecatBulkRunState,
  type OpenIcecatIndexEntry
} from "../src/index.ts";

async function* sequence<T>(values: readonly T[]): AsyncGenerator<T> {
  for (const value of values) yield value;
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

function entry(productId: string, quality = "ICECAT"): OpenIcecatIndexEntry {
  return {
    path: `files/${productId}.xml`,
    productId,
    quality,
    gtins: [],
    countryMarkets: []
  };
}

function storedIdentity(overrides: Partial<OpenIcecatBulkRunIdentity> = {}): OpenIcecatBulkRunIdentity {
  return {
    sourceId: "open-icecat-el",
    importKind: "daily",
    sourceUrl: "https://data.icecat.biz/export/freexml/EL/daily.index.csv.gz",
    sourceFingerprint: "sha256:test-feed",
    processingVersion: OPEN_ICECAT_BULK_PROCESSING_VERSION,
    ...overrides
  };
}

test("Open Icecat stream preserves multiline and doubled-quote fields across chunks", async () => {
  const csv = 'path,product_id,quality,model_name\nfiles/1.xml,1,ICECAT,"Line one\nLine two ""quoted"""\n';
  const parsed = await collect(parseOpenIcecatIndexStream(sequence<string | Uint8Array>([
    csv.slice(0, 41),
    new TextEncoder().encode(csv.slice(41, 57)),
    csv.slice(57, 70),
    csv.slice(70)
  ])));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.productId, "1");
  assert.equal(parsed[0]?.modelName, 'Line one\nLine two "quoted"');
});

test("Open Icecat mixed chunk stream fails closed instead of reordering partial UTF-8", async () => {
  const encoder = new TextEncoder();
  const prefix = encoder.encode('path,product_id,model_name\nfiles/1.xml,1,"');
  const alpha = encoder.encode("α");
  const suffix = encoder.encode('"\n');
  const first = new Uint8Array(prefix.length + 1);
  first.set(prefix, 0);
  first[prefix.length] = alpha[0];
  const last = new Uint8Array(1 + suffix.length);
  last[0] = alpha[1];
  last.set(suffix, 1);

  await assert.rejects(
    async () => collect(parseOpenIcecatIndexStream(sequence<string | Uint8Array>([first, "X", last]))),
    TypeError
  );
});

test("Open Icecat stream rejects an oversized unterminated record", async () => {
  const source = sequence([
    "path,product_id\n",
    'files/1.xml,"' + "x".repeat(64)
  ]);

  await assert.rejects(
    async () => collect(parseOpenIcecatIndexStream(source, {}, { maxRecordChars: 32 })),
    /record exceeds maximum size of 32 characters/
  );
});

test("Open Icecat stream can retain daily removal rows", async () => {
  const csv = "path,product_id,quality\nfiles/removed.xml,removed,REMOVED\n";
  const parsed = await collect(parseOpenIcecatIndexStream(sequence([csv]), { includeRemoved: true }));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.productId, "removed");
  assert.equal(parsed[0]?.quality, "REMOVED");
});

test("Open Icecat bulk runner resumes after the durable checkpoint and separates removals", async () => {
  const identity = storedIdentity();
  const batches: OpenIcecatBulkBatch[] = [];
  let completedAt = -1;
  const repository: OpenIcecatBulkRepository = {
    async beginOrResume(requested) {
      assert.deepEqual(requested, identity);
      return {
        ...identity,
        runId: "run-resume",
        checkpoint: 1,
        completed: false,
        persisted: 1,
        removed: 0
      };
    },
    async commitBatch(batch) {
      batches.push(batch);
    },
    async complete(_runId, checkpoint) {
      completedAt = checkpoint;
    },
    async fail() {
      assert.fail("resume scenario should not fail");
    }
  };

  const result = await runOpenIcecatBulkImport({
    identity,
    entries: sequence([entry("first"), entry("second"), entry("gone", "REMOVED")]),
    repository,
    batchSize: 1
  });

  assert.equal(result.resumedFrom, 1);
  assert.equal(result.checkpoint, 3);
  assert.equal(result.candidates, 1);
  assert.equal(result.removals, 1);
  assert.equal(completedAt, 3);
  assert.deepEqual(batches.map((batch) => batch.checkpoint), [2, 3]);
  assert.deepEqual(batches[0]?.candidates.map((item) => item.productId), ["second"]);
  assert.deepEqual(batches[1]?.removals.map((item) => item.productId), ["gone"]);
});

test("Open Icecat bulk runner refuses a checkpoint from another processing version", async () => {
  const identity = storedIdentity();
  let commitCalls = 0;
  const repository: OpenIcecatBulkRepository = {
    async beginOrResume() {
      return {
        ...identity,
        processingVersion: "open-icecat-bulk-v0",
        runId: "run-old-parser",
        checkpoint: 50,
        completed: false,
        persisted: 50,
        removed: 0
      };
    },
    async commitBatch() {
      commitCalls += 1;
    },
    async complete() {},
    async fail() {}
  };

  await assert.rejects(
    () => runOpenIcecatBulkImport({ identity, entries: sequence([entry("new")]), repository }),
    /resume identity mismatch for processingVersion/
  );
  assert.equal(commitCalls, 0);
});

test("Open Icecat bulk runner safely replays a batch after an atomic commit failure", async () => {
  const identity = storedIdentity({ importKind: "full" });
  let durableCheckpoint = 0;
  let failNextCommit = true;
  let failCalls = 0;
  const persisted = new Set<string>();

  const repository: OpenIcecatBulkRepository = {
    async beginOrResume(requested): Promise<OpenIcecatBulkRunState> {
      return {
        ...requested,
        runId: "run-atomic",
        checkpoint: durableCheckpoint,
        completed: false,
        persisted: persisted.size,
        removed: 0
      };
    },
    async commitBatch(batch) {
      if (failNextCommit) {
        failNextCommit = false;
        throw new Error("simulated transaction rollback");
      }
      for (const candidate of batch.candidates) persisted.add(candidate.productId);
      durableCheckpoint = batch.checkpoint;
    },
    async complete(_runId, checkpoint) {
      durableCheckpoint = checkpoint;
    },
    async fail() {
      failCalls += 1;
    }
  };

  const makeEntries = () => sequence([entry("one"), entry("two")]);

  await assert.rejects(
    () => runOpenIcecatBulkImport({ identity, entries: makeEntries(), repository, batchSize: 1 }),
    /simulated transaction rollback/
  );
  assert.equal(durableCheckpoint, 0);
  assert.equal(persisted.size, 0);
  assert.equal(failCalls, 1);

  const replay = await runOpenIcecatBulkImport({ identity, entries: makeEntries(), repository, batchSize: 1 });
  assert.equal(replay.checkpoint, 2);
  assert.deepEqual([...persisted], ["one", "two"]);
});

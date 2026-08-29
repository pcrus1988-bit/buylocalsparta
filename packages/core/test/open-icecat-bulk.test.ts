import test from "node:test";
import assert from "node:assert/strict";
import {
  OPEN_ICECAT_BULK_PROCESSING_VERSION,
  parseOpenIcecatIndexSourceEvents,
  parseOpenIcecatIndexStream,
  runOpenIcecatBulkImport,
  type OpenIcecatBulkBatch,
  type OpenIcecatBulkRepository,
  type OpenIcecatBulkRunIdentity,
  type OpenIcecatBulkRunState,
  type OpenIcecatIndexEntry,
  type OpenIcecatIndexSourceEvent
} from "../src/index.ts";

const GTIN = "4006381333931";

async function* sequence<T>(values: readonly T[]): AsyncGenerator<T> {
  for (const value of values) yield value;
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

async function* textChunks(value: string, widths: readonly number[] = [7, 13, 5, 19]): AsyncGenerator<string> {
  let offset = 0;
  let index = 0;
  while (offset < value.length) {
    const width = widths[index % widths.length] ?? 8;
    yield value.slice(offset, offset + width);
    offset += width;
    index += 1;
  }
}

function entry(productId: string, quality = "ICECAT"): OpenIcecatIndexEntry {
  return {
    path: `files/${productId}.xml`,
    productId,
    quality,
    gtins: [GTIN],
    onMarket: true,
    countryMarkets: ["GR"],
    gtinsApproved: true
  };
}

function storedIdentity(overrides: Partial<OpenIcecatBulkRunIdentity> = {}): OpenIcecatBulkRunIdentity {
  return {
    sourceId: "00000000-0000-4000-8000-000000000001",
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

test("Open Icecat source events expose accepted, rejected and filtered rows with stable offsets", async () => {
  const csv = [
    "path,product_id,quality,ean_upc,on_market,country_market,ean_upc_is_approved",
    `files/1.xml,1,ICECAT,${GTIN},1,GR,1`,
    "files/missing.xml,,ICECAT,,1,GR,1",
    `files/2.xml,2,ICECAT,${GTIN},0,GR,1`,
    `files/3.xml,3,ICECAT,${GTIN},1,GR,1`
  ].join("\n");

  const events = await collect(parseOpenIcecatIndexSourceEvents(textChunks(csv), {
    requireOnMarket: true,
    requireApprovedGtin: true,
    country: "GR"
  }));

  assert.deepEqual(events.map((event) => [event.sourceOffset, event.kind, "reason" in event ? event.reason : undefined]), [
    [0, "entry", undefined],
    [1, "rejected", "invalid_record"],
    [2, "filtered", "off_market"],
    [3, "entry", undefined]
  ]);
});

test("Open Icecat entry-only stream remains a compatibility view over source events", async () => {
  const csv = [
    "path,product_id,quality,ean_upc,on_market,country_market,ean_upc_is_approved",
    `files/1.xml,1,ICECAT,${GTIN},1,GR,1`,
    "files/missing.xml,,ICECAT,,1,GR,1",
    `files/2.xml,2,ICECAT,${GTIN},0,GR,1`,
    `files/3.xml,3,ICECAT,${GTIN},1,GR,1`
  ].join("\n");

  const entries = await collect(parseOpenIcecatIndexStream(textChunks(csv), { requireOnMarket: true }));
  assert.deepEqual(entries.map((item) => item.productId), ["1", "3"]);
});

test("Open Icecat stream can retain daily removal rows", async () => {
  const csv = "path,product_id,quality\nfiles/removed.xml,removed,REMOVED\n";
  const parsed = await collect(parseOpenIcecatIndexStream(sequence([csv]), { includeRemoved: true }));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.productId, "removed");
  assert.equal(parsed[0]?.quality, "REMOVED");
});

test("Open Icecat bulk runner commits reject/filter-only rows so the durable cursor advances", async () => {
  const identity = storedIdentity({ importKind: "full" });
  const repository = new FakeBulkRepository(identity);
  const events: OpenIcecatIndexSourceEvent[] = [
    { kind: "rejected", sourceOffset: 0, reason: "invalid_record" },
    { kind: "filtered", sourceOffset: 1, reason: "off_market", entry: entry("2") },
    { kind: "entry", sourceOffset: 2, entry: entry("3") }
  ];

  const result = await runOpenIcecatBulkImport({ identity, events: sequence(events), repository, batchSize: 2 });

  assert.equal(repository.commits.length, 2);
  assert.deepEqual(repository.commits[0], {
    runId: "run-1",
    checkpoint: 2,
    sourceRows: 2,
    candidates: [],
    removals: [],
    rejected: 1,
    filtered: 1
  });
  assert.equal(repository.durableCheckpoint, 3);
  assert.equal(result.checkpoint, 3);
  assert.equal(result.sourceRows, 3);
  assert.equal(result.rejected, 1);
  assert.equal(result.filtered, 1);
  assert.equal(result.candidates, 1);
  assert.equal(repository.completedAtCheckpoint, 3);
});

test("Open Icecat bulk runner resumes after the durable source-row checkpoint, including prior rejects", async () => {
  const identity = storedIdentity({ importKind: "full" });
  const repository = new FakeBulkRepository(identity, { checkpoint: 2, rejected: 1, filtered: 1 });
  const events: OpenIcecatIndexSourceEvent[] = [
    { kind: "entry", sourceOffset: 0, entry: entry("1") },
    { kind: "rejected", sourceOffset: 1, reason: "invalid_record" },
    { kind: "entry", sourceOffset: 2, entry: entry("3") },
    { kind: "entry", sourceOffset: 3, entry: entry("4") }
  ];

  const result = await runOpenIcecatBulkImport({ identity, events: sequence(events), repository, batchSize: 10 });
  assert.equal(result.resumedFrom, 2);
  assert.equal(result.sourceRows, 2);
  assert.equal(result.candidates, 2);
  assert.equal(repository.durableCheckpoint, 4);
  assert.deepEqual(repository.commits[0]?.candidates.map((item) => item.productId), ["3", "4"]);
});

test("Open Icecat bulk runner separates daily removal rows", async () => {
  const identity = storedIdentity();
  const repository = new FakeBulkRepository(identity, { checkpoint: 1, persisted: 1 });
  const events: OpenIcecatIndexSourceEvent[] = [
    { kind: "entry", sourceOffset: 0, entry: entry("first") },
    { kind: "entry", sourceOffset: 1, entry: entry("second") },
    { kind: "entry", sourceOffset: 2, entry: entry("gone", "REMOVED") }
  ];

  const result = await runOpenIcecatBulkImport({ identity, events: sequence(events), repository, batchSize: 1 });

  assert.equal(result.resumedFrom, 1);
  assert.equal(result.checkpoint, 3);
  assert.equal(result.candidates, 1);
  assert.equal(result.removals, 1);
  assert.deepEqual(repository.commits.map((batch) => batch.checkpoint), [2, 3]);
  assert.deepEqual(repository.commits[0]?.candidates.map((item) => item.productId), ["second"]);
  assert.deepEqual(repository.commits[1]?.removals.map((item) => item.productId), ["gone"]);
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
        removed: 0,
        rejected: 0,
        filtered: 0
      };
    },
    async commitBatch() {
      commitCalls += 1;
    },
    async complete() {},
    async fail() {}
  };

  await assert.rejects(
    () => runOpenIcecatBulkImport({ identity, events: sequence<OpenIcecatIndexSourceEvent>([]), repository }),
    /resume identity mismatch for processingVersion/
  );
  assert.equal(commitCalls, 0);
});

test("Open Icecat bulk runner rejects a gap in terminal source-row events", async () => {
  const identity = storedIdentity({ importKind: "full" });
  const repository = new FakeBulkRepository(identity);
  const events: OpenIcecatIndexSourceEvent[] = [
    { kind: "entry", sourceOffset: 0, entry: entry("one") },
    { kind: "entry", sourceOffset: 2, entry: entry("three") }
  ];

  await assert.rejects(
    () => runOpenIcecatBulkImport({ identity, events: sequence(events), repository, batchSize: 10 }),
    /source-row gap: expected offset 1, received 2/
  );
  assert.equal(repository.durableCheckpoint, 0);
});

test("Open Icecat bulk runner safely replays a batch after an atomic commit failure", async () => {
  const identity = storedIdentity({ importKind: "full" });
  let failNextCommit = true;
  let failCalls = 0;
  const persisted = new Set<string>();
  let durableCheckpoint = 0;

  const repository: OpenIcecatBulkRepository = {
    async beginOrResume(requested): Promise<OpenIcecatBulkRunState> {
      return {
        ...requested,
        runId: "run-atomic",
        checkpoint: durableCheckpoint,
        completed: false,
        persisted: persisted.size,
        removed: 0,
        rejected: 0,
        filtered: 0
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

  const makeEvents = () => sequence<OpenIcecatIndexSourceEvent>([
    { kind: "entry", sourceOffset: 0, entry: entry("one") },
    { kind: "entry", sourceOffset: 1, entry: entry("two") }
  ]);

  await assert.rejects(
    () => runOpenIcecatBulkImport({ identity, events: makeEvents(), repository, batchSize: 1 }),
    /simulated transaction rollback/
  );
  assert.equal(durableCheckpoint, 0);
  assert.equal(persisted.size, 0);
  assert.equal(failCalls, 1);

  const replay = await runOpenIcecatBulkImport({ identity, events: makeEvents(), repository, batchSize: 1 });
  assert.equal(replay.checkpoint, 2);
  assert.deepEqual([...persisted], ["one", "two"]);
});

test("Open Icecat bulk runner preserves the import error when failure auditing also fails", async () => {
  const identity = storedIdentity({ importKind: "full" });
  const repository: OpenIcecatBulkRepository = {
    async beginOrResume(requested) {
      return {
        ...requested,
        runId: "run-audit-failure",
        checkpoint: 0,
        completed: false,
        persisted: 0,
        removed: 0,
        rejected: 0,
        filtered: 0
      };
    },
    async commitBatch() {
      throw new Error("primary import failure");
    },
    async complete() {},
    async fail() {
      throw new Error("secondary audit failure");
    }
  };

  await assert.rejects(
    () => runOpenIcecatBulkImport({
      identity,
      events: sequence<OpenIcecatIndexSourceEvent>([{ kind: "entry", sourceOffset: 0, entry: entry("one") }]),
      repository,
      batchSize: 1
    }),
    /primary import failure/
  );
});

class FakeBulkRepository implements OpenIcecatBulkRepository {
  readonly commits: OpenIcecatBulkBatch[] = [];
  durableCheckpoint: number;
  completedAtCheckpoint?: number;
  failure?: string;
  readonly #identity: OpenIcecatBulkRunIdentity;
  readonly #initial: Partial<OpenIcecatBulkRunState>;
  readonly #failAtCheckpoint?: number;

  constructor(
    identity: OpenIcecatBulkRunIdentity,
    initial: Partial<OpenIcecatBulkRunState> = {},
    failAtCheckpoint?: number
  ) {
    this.#identity = identity;
    this.#initial = initial;
    this.durableCheckpoint = initial.checkpoint ?? 0;
    this.#failAtCheckpoint = failAtCheckpoint;
  }

  async beginOrResume(requested: OpenIcecatBulkRunIdentity): Promise<OpenIcecatBulkRunState> {
    assert.deepEqual(requested, this.#identity);
    return {
      ...this.#identity,
      runId: this.#initial.runId ?? "run-1",
      checkpoint: this.#initial.checkpoint ?? 0,
      completed: this.#initial.completed ?? false,
      persisted: this.#initial.persisted ?? 0,
      removed: this.#initial.removed ?? 0,
      rejected: this.#initial.rejected ?? 0,
      filtered: this.#initial.filtered ?? 0
    };
  }

  async commitBatch(batch: OpenIcecatBulkBatch): Promise<void> {
    if (batch.checkpoint === this.#failAtCheckpoint) throw new Error("simulated commit failure");
    this.commits.push({ ...batch, candidates: [...batch.candidates], removals: [...batch.removals] });
    this.durableCheckpoint = batch.checkpoint;
  }

  async complete(_runId: string, checkpoint: number): Promise<void> {
    this.completedAtCheckpoint = checkpoint;
    this.durableCheckpoint = checkpoint;
  }

  async fail(_runId: string, error: string): Promise<void> {
    this.failure = error;
  }
}

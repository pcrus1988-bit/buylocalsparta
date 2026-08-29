import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOpenIcecatIndexSourceEvents,
  parseOpenIcecatIndexStream,
  runOpenIcecatBulkImport,
  type OpenIcecatBulkBatch,
  type OpenIcecatBulkRepository,
  type OpenIcecatBulkRunIdentity,
  type OpenIcecatBulkRunState,
  type OpenIcecatIndexEntry,
  type OpenIcecatIndexSourceEvent
} from "../src/ingestion/open-icecat/index.ts";

const GTIN = "4006381333931";
const IDENTITY: OpenIcecatBulkRunIdentity = {
  sourceId: "00000000-0000-4000-8000-000000000001",
  importKind: "full",
  sourceUrl: "https://data.icecat.biz/export/freexml/EL/files.index.csv.gz",
  sourceFingerprint: "etag:test-full"
};

function entry(productId: string, quality = "ICECAT"): OpenIcecatIndexEntry {
  return {
    path: `/export/freexml/EL/${productId}.xml`,
    productId,
    quality,
    gtins: [GTIN],
    onMarket: true,
    countryMarkets: ["GR"],
    gtinsApproved: true
  };
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

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) values.push(value);
  return values;
}

test("source event stream exposes accepted, rejected and filtered rows with stable offsets", async () => {
  const csv = [
    "path,product_id,quality,ean_upc,on_market,country_market,ean_upc_is_approved",
    `/export/freexml/EL/1.xml,1,ICECAT,${GTIN},1,GR,1`,
    "/export/freexml/EL/missing.xml,,ICECAT,,1,GR,1",
    `/export/freexml/EL/2.xml,2,ICECAT,${GTIN},0,GR,1`,
    `/export/freexml/EL/3.xml,3,ICECAT,${GTIN},1,GR,1`
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

test("entry-only stream remains a compatibility view over source events", async () => {
  const csv = [
    "path,product_id,quality,ean_upc,on_market,country_market,ean_upc_is_approved",
    `/export/freexml/EL/1.xml,1,ICECAT,${GTIN},1,GR,1`,
    "/export/freexml/EL/missing.xml,,ICECAT,,1,GR,1",
    `/export/freexml/EL/2.xml,2,ICECAT,${GTIN},0,GR,1`,
    `/export/freexml/EL/3.xml,3,ICECAT,${GTIN},1,GR,1`
  ].join("\n");

  const entries = await collect(parseOpenIcecatIndexStream(textChunks(csv), { requireOnMarket: true }));
  assert.deepEqual(entries.map((item) => item.productId), ["1", "3"]);
});

test("runner commits reject/filter-only rows so the durable cursor advances", async () => {
  const repository = new FakeBulkRepository();
  const events: OpenIcecatIndexSourceEvent[] = [
    { kind: "rejected", sourceOffset: 0, reason: "invalid_record" },
    { kind: "filtered", sourceOffset: 1, reason: "off_market", entry: entry("2") },
    { kind: "entry", sourceOffset: 2, entry: entry("3") }
  ];

  const result = await runOpenIcecatBulkImport({ identity: IDENTITY, events: asyncValues(events), repository, batchSize: 2 });

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

test("resume skips source offsets below the durable checkpoint, including prior rejects", async () => {
  const repository = new FakeBulkRepository({ checkpoint: 2, rejected: 1, filtered: 1 });
  const events: OpenIcecatIndexSourceEvent[] = [
    { kind: "entry", sourceOffset: 0, entry: entry("1") },
    { kind: "rejected", sourceOffset: 1, reason: "invalid_record" },
    { kind: "entry", sourceOffset: 2, entry: entry("3") },
    { kind: "entry", sourceOffset: 3, entry: entry("4") }
  ];

  const result = await runOpenIcecatBulkImport({ identity: IDENTITY, events: asyncValues(events), repository, batchSize: 10 });
  assert.equal(result.resumedFrom, 2);
  assert.equal(result.sourceRows, 2);
  assert.equal(result.candidates, 2);
  assert.equal(repository.durableCheckpoint, 4);
  assert.deepEqual(repository.commits[0]?.candidates.map((item) => item.productId), ["3", "4"]);
});

test("a failed batch leaves the previous durable checkpoint for exact replay", async () => {
  const repository = new FakeBulkRepository(undefined, 4);
  const events: OpenIcecatIndexSourceEvent[] = [
    { kind: "entry", sourceOffset: 0, entry: entry("1") },
    { kind: "rejected", sourceOffset: 1, reason: "invalid_record" },
    { kind: "entry", sourceOffset: 2, entry: entry("3") },
    { kind: "filtered", sourceOffset: 3, reason: "country", entry: entry("4") }
  ];

  await assert.rejects(
    runOpenIcecatBulkImport({ identity: IDENTITY, events: asyncValues(events), repository, batchSize: 2 }),
    /simulated commit failure/
  );
  assert.equal(repository.durableCheckpoint, 2);
  assert.equal(repository.completedAtCheckpoint, undefined);
  assert.match(repository.failure ?? "", /simulated commit failure/);
});

test("daily REMOVED entries are persisted as removals when the event stream includes them", async () => {
  const repository = new FakeBulkRepository();
  const removed = entry("42", "REMOVED");
  const identity: OpenIcecatBulkRunIdentity = { ...IDENTITY, importKind: "daily", sourceFingerprint: "etag:test-daily" };
  const result = await runOpenIcecatBulkImport({
    identity,
    events: asyncValues([{ kind: "entry", sourceOffset: 0, entry: removed }]),
    repository
  });

  assert.equal(result.removals, 1);
  assert.equal(result.candidates, 0);
  assert.deepEqual(repository.commits[0]?.removals.map((item) => item.productId), ["42"]);
});

async function* asyncValues<T>(values: readonly T[]): AsyncGenerator<T> {
  for (const value of values) yield value;
}

class FakeBulkRepository implements OpenIcecatBulkRepository {
  readonly commits: OpenIcecatBulkBatch[] = [];
  durableCheckpoint: number;
  completedAtCheckpoint?: number;
  failure?: string;
  readonly #initial: OpenIcecatBulkRunState;
  readonly #failAtCheckpoint?: number;

  constructor(initial: Partial<OpenIcecatBulkRunState> = {}, failAtCheckpoint?: number) {
    this.#initial = {
      runId: initial.runId ?? "run-1",
      checkpoint: initial.checkpoint ?? 0,
      completed: initial.completed ?? false,
      persisted: initial.persisted ?? 0,
      removed: initial.removed ?? 0,
      rejected: initial.rejected ?? 0,
      filtered: initial.filtered ?? 0
    };
    this.durableCheckpoint = this.#initial.checkpoint;
    this.#failAtCheckpoint = failAtCheckpoint;
  }

  async beginOrResume(): Promise<OpenIcecatBulkRunState> {
    return this.#initial;
  }

  async commitBatch(batch: OpenIcecatBulkBatch): Promise<void> {
    if (batch.checkpoint === this.#failAtCheckpoint) throw new Error("simulated commit failure");
    this.commits.push({ ...batch, candidates: [...batch.candidates], removals: [...batch.removals] });
    this.durableCheckpoint = batch.checkpoint;
  }

  async complete(_runId: string, checkpoint: number): Promise<void> {
    this.completedAtCheckpoint = checkpoint;
  }

  async fail(_runId: string, error: string): Promise<void> {
    this.failure = error;
  }
}

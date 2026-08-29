import type {
  OpenIcecatIndexEntry,
  OpenIcecatIndexFilter,
  OpenIcecatIndexSourceEvent
} from "./types.ts";
import {
  detectDelimiter,
  getOpenIcecatIndexFilterReason,
  openIcecatIndexEntryFromRecord,
  parseDelimitedLine
} from "./index-csv.ts";

export type OpenIcecatIndexChunk = string | Uint8Array;

/**
 * Streams every non-empty Open Icecat data record as a terminal source event.
 * sourceOffset is zero-based and excludes the header. It is stable across
 * filtering/rejection and is therefore safe to use as the durable resume cursor.
 */
export async function* parseOpenIcecatIndexSourceEvents(
  chunks: AsyncIterable<OpenIcecatIndexChunk>,
  filter: OpenIcecatIndexFilter = {}
): AsyncGenerator<OpenIcecatIndexSourceEvent> {
  const decoder = new TextDecoder();
  let header: readonly string[] | undefined;
  let delimiter = ",";
  let sourceOffset = 0;

  for await (const record of streamDelimitedRecords(chunks, decoder)) {
    if (!record.trim()) continue;
    if (!header) {
      delimiter = detectDelimiter(record);
      header = parseDelimitedLine(record, delimiter).map((value) => value.trim().toLowerCase());
      continue;
    }

    const currentOffset = sourceOffset;
    sourceOffset += 1;
    const entry = openIcecatIndexEntryFromRecord(record, header, delimiter);
    if (!entry) {
      yield { kind: "rejected", sourceOffset: currentOffset, reason: "invalid_record" };
      continue;
    }

    const filterReason = getOpenIcecatIndexFilterReason(entry, filter);
    if (filterReason) {
      yield { kind: "filtered", sourceOffset: currentOffset, reason: filterReason, entry };
      continue;
    }

    yield { kind: "entry", sourceOffset: currentOffset, entry };
  }
}

/**
 * Compatibility entry-only view of the source stream. Bulk/resumable ingestion
 * must consume parseOpenIcecatIndexSourceEvents so rejected and filtered rows
 * remain visible to the durable checkpoint.
 */
export async function* parseOpenIcecatIndexStream(
  chunks: AsyncIterable<OpenIcecatIndexChunk>,
  filter: OpenIcecatIndexFilter = {}
): AsyncGenerator<OpenIcecatIndexEntry> {
  for await (const event of parseOpenIcecatIndexSourceEvents(chunks, filter)) {
    if (event.kind === "entry") yield event.entry;
  }
}

async function* streamDelimitedRecords(
  chunks: AsyncIterable<OpenIcecatIndexChunk>,
  decoder: TextDecoder
): AsyncGenerator<string> {
  let record = "";
  let quoted = false;
  let quotePending = false;
  let skipLeadingLf = false;

  const consume = function* (text: string): Generator<string> {
    for (const char of text) {
      if (skipLeadingLf) {
        skipLeadingLf = false;
        if (char === "\n") continue;
      }

      if (quotePending) {
        if (char === '"') {
          record += '"';
          quotePending = false;
          continue;
        }
        quoted = false;
        quotePending = false;
      }

      if (char === '"') {
        record += char;
        if (quoted) quotePending = true;
        else quoted = true;
        continue;
      }

      if (!quoted && (char === "\n" || char === "\r")) {
        yield record;
        record = "";
        if (char === "\r") skipLeadingLf = true;
        continue;
      }

      record += char;
    }
  };

  for await (const chunk of chunks) {
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    yield* consume(text);
  }
  const tail = decoder.decode();
  if (tail) yield* consume(tail);
  if (record.length) yield record;
}

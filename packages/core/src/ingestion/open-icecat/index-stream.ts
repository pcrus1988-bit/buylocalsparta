import type { OpenIcecatIndexEntry, OpenIcecatIndexFilter } from "./types.ts";
import {
  detectDelimiter,
  matchesOpenIcecatIndexFilter,
  openIcecatIndexEntryFromRecord,
  parseDelimitedLine
} from "./index-csv.ts";

export type OpenIcecatIndexChunk = string | Uint8Array;

export async function* parseOpenIcecatIndexStream(
  chunks: AsyncIterable<OpenIcecatIndexChunk>,
  filter: OpenIcecatIndexFilter = {}
): AsyncGenerator<OpenIcecatIndexEntry> {
  const decoder = new TextDecoder();
  let header: readonly string[] | undefined;
  let delimiter = ",";

  for await (const record of streamDelimitedRecords(chunks, decoder)) {
    if (!record.trim()) continue;
    if (!header) {
      delimiter = detectDelimiter(record);
      header = parseDelimitedLine(record, delimiter).map((value) => value.trim().toLowerCase());
      continue;
    }
    const entry = openIcecatIndexEntryFromRecord(record, header, delimiter);
    if (entry && matchesOpenIcecatIndexFilter(entry, filter)) yield entry;
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

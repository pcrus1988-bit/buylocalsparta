import type { OpenIcecatIndexEntry, OpenIcecatIndexFilter } from "./types.ts";
import {
  detectDelimiter,
  matchesOpenIcecatIndexFilter,
  openIcecatIndexEntryFromRecord,
  parseDelimitedLine
} from "./index-csv.ts";

export type OpenIcecatIndexChunk = string | Uint8Array;

export const DEFAULT_OPEN_ICECAT_MAX_RECORD_CHARS = 8 * 1024 * 1024;

export type OpenIcecatIndexStreamOptions = Readonly<{
  maxRecordChars?: number;
}>;

export async function* parseOpenIcecatIndexStream(
  chunks: AsyncIterable<OpenIcecatIndexChunk>,
  filter: OpenIcecatIndexFilter = {},
  options: OpenIcecatIndexStreamOptions = {}
): AsyncGenerator<OpenIcecatIndexEntry> {
  let header: readonly string[] | undefined;
  let delimiter = ",";
  const maxRecordChars = normalizeMaximumRecordChars(options.maxRecordChars);

  for await (const record of streamDelimitedRecords(chunks, maxRecordChars)) {
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
  maxRecordChars: number
): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  let record = "";
  let quoted = false;
  let quotePending = false;
  let skipLeadingLf = false;

  const append = (value: string): void => {
    record += value;
    if (record.length > maxRecordChars) {
      throw new Error(`Open Icecat index record exceeds maximum size of ${maxRecordChars} characters.`);
    }
  };

  const consume = function* (text: string): Generator<string> {
    for (const char of text) {
      if (skipLeadingLf) {
        skipLeadingLf = false;
        if (char === "\n") continue;
      }

      if (quotePending) {
        if (char === '"') {
          append('"');
          quotePending = false;
          continue;
        }
        quoted = false;
        quotePending = false;
      }

      if (char === '"') {
        append(char);
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

      append(char);
    }
  };

  for await (const chunk of chunks) {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    const text = decoder.decode(bytes, { stream: true });
    if (text) yield* consume(text);
  }
  const tail = decoder.decode();
  if (tail) yield* consume(tail);
  if (record.length) yield record;
}

function normalizeMaximumRecordChars(value: number | undefined): number {
  if (value === undefined) return DEFAULT_OPEN_ICECAT_MAX_RECORD_CHARS;
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("Open Icecat maximum record size must be a positive finite number.");
  }
  return Math.floor(value);
}

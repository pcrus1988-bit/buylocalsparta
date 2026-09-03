import test from "node:test";
import assert from "node:assert/strict";
import { dedupeOpenIcecatIndexEntries } from "./postgres-open-icecat-bulk.ts";
import type { OpenIcecatIndexEntry } from "../ingestion/open-icecat/types.ts";

function entry(productId: string, path: string): OpenIcecatIndexEntry {
  return { productId, path, gtins: [] };
}

test("dedupeOpenIcecatIndexEntries keeps the last provider row for duplicate product ids", () => {
  const rows = [entry("100", "first.xml"), entry("200", "second.xml"), entry("100", "latest.xml")];

  assert.deepEqual(dedupeOpenIcecatIndexEntries(rows), [entry("100", "latest.xml"), entry("200", "second.xml")]);
});

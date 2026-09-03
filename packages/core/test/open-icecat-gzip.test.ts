import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { gunzipOpenIcecatChunks } from "../src/ingestion/open-icecat/gzip-stream.ts";

test("Open Icecat gzip decoder accepts concatenated gzip members", async () => {
  const compressed = Buffer.concat([
    gzipSync("header_a,header_b\nvalue_1,value_2\n"),
    gzipSync("value_3,value_4\n")
  ]);

  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield compressed.subarray(0, 11);
    yield compressed.subarray(11, 37);
    yield compressed.subarray(37);
  }

  const decoded: Buffer[] = [];
  for await (const chunk of gunzipOpenIcecatChunks(chunks())) {
    decoded.push(Buffer.from(chunk));
  }

  assert.equal(
    Buffer.concat(decoded).toString("utf8"),
    "header_a,header_b\nvalue_1,value_2\nvalue_3,value_4\n"
  );
});

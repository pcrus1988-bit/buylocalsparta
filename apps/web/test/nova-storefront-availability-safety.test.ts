import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/lib/published-dropship-storefront.ts", import.meta.url);

test("published Nova storefront cards require fresh authoritative availability", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /ds\.api_authoritative_availability=true/);
  assert.match(source, /dso\.cached_available=true/);
  assert.match(source, /dso\.availability_expires_at IS NOT NULL/);
  assert.match(source, /dso\.availability_expires_at > now\(\)/);
});

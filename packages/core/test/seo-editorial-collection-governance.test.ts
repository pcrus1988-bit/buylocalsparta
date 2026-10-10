import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EDITORIAL_COLLECTIONS } from "../../../apps/web/src/lib/editorial-collections.ts";

const graph = readFileSync(new URL("../../../apps/web/src/lib/seo-crawl-graph.ts", import.meta.url), "utf8");

test("all editorial collection slugs are present in shared governance", () => {
  assert.equal(EDITORIAL_COLLECTIONS.length, 3);
  assert.ok(graph.includes('import { EDITORIAL_COLLECTIONS } from "./editorial-collections";'));
  assert.ok(graph.includes("for (const collection of EDITORIAL_COLLECTIONS)"));
  assert.ok(graph.includes("editorial-collection:"));
  assert.ok(graph.includes("absoluteSeoCanonical(settings.canonicalOrigin, reference, override)"));
  assert.ok(graph.includes("indexAllowed: control.indexAllowed"));
  assert.ok(graph.includes("sitemapAllowed: control.sitemapAllowed"));
});

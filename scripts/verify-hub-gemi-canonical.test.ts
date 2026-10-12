import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../apps/web/src/lib/hub-gemi-directory.ts", import.meta.url)), "utf8");
const names = [
  "listPublicHubCensus(",
  "getPublicHubCensus(",
  "convertedClaimUrlForGemiCensus(",
  "hubHasIndexReadyCensus(",
  "publicHubCensusCategoryCounts("
] as const;
const sections = new Map(names.map((name, i) => {
  const start = source.indexOf("export async function " + name);
  const end = i < names.length - 1 ? source.indexOf("export async function " + names[i + 1], start + 1) : source.length;
  if (start < 0 || end < 0) throw new Error("Missing canonical census function: " + name);
  return [name, source.slice(start, end)] as const;
}));

test("all census public read paths exclude vendor and owner-converted duplicates", () => {
  for (const name of [names[0], names[1], names[3], names[4]]) {
    const fragment = sections.get(name) ?? "";
    assert.match(fragment, /public\.vendor_businesses/);
    assert.match(fragment, /public\.hub_expansion_prospects/);
    assert.match(fragment, /h\.status='converted'/);
    assert.doesNotMatch(fragment, /h\.plan_code='claim'/);
  }
});

test("canonical redirect covers converted HUB pages of every plan and existing live vendors", () => {
  const fragment = sections.get(names[2]) ?? "";
  assert.match(fragment, /h\.hub_slug/);
  assert.match(fragment, /public\.vendor_businesses/);
  assert.match(fragment, /v\.public_directory_visible=true/);
  assert.doesNotMatch(fragment, /h\.plan_code='claim'/);
});

test("all public reads require explicitly published census state", () => {
  for (const name of names) {
    assert.match(sections.get(name) ?? "", /display_status='published'/);
  }
});

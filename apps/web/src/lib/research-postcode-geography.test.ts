import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Validate the crosswalk fixture without importing the server-only resolver
// into a Node test (the Next.js server-only package intentionally blocks it).
const lookup = JSON.parse(readFileSync(
  new URL("./research-postcode-prefecture-map.json",import.meta.url),"utf8"
)) as Record<string,readonly [string,string]>;
const geoSource = readFileSync(new URL("./research-postcode-geography.ts",import.meta.url),"utf8");
const liveSource = readFileSync(new URL("./research-live-preview-data.ts",import.meta.url),"utf8");
const voicesSource = readFileSync(new URL("./research-live-voices-preview.ts",import.meta.url),"utf8");
const publishedSource = readFileSync(new URL("./research-survey-analysis.ts",import.meta.url),"utf8");
const participationSource = readFileSync(new URL("./research-observatory-runtime.ts",import.meta.url),"utf8");

test("postcodes resolve to known geographic boundary keys and 13-region IDs",()=>{
  assert.equal(Object.keys(lookup).length,1041);
  assert.deepEqual(lookup["11142"],["Athens","ATTICA"]);
  assert.deepEqual(lookup["24100"],["Mesinia","PELOPONNESE"]);
  assert.deepEqual(lookup["71306"],["Heraklio","CRETE"]);
  assert.ok(Object.values(lookup).every(item=>Array.isArray(item)&&item.length===2));
});
test("raw postcodes never pass through browser geography projections",()=>{
  assert.match(geoSource,/import "server-only"/);
  assert.match(geoSource,/postcodePrefectures/);
  assert.match(liveSource,/resolveResearchAdministrativeGeography\(row\.postcode,row\.prefecture\)/);
  assert.match(liveSource,/prefectureCode/);
  assert.match(voicesSource,/resolveResearchAdministrativeGeography\(row\.postcode,row\.prefecture\)\.prefectureLabel/);
  assert.match(participationSource,/summarizeResearchPostcodeCells/);
  assert.doesNotMatch(voicesSource,/quotes\.push\(\{[^}]*postcode/);
});
test("analysis preserves design-strata calibration while deriving public geographies",()=>{
  assert.match(publishedSource,/region_code: response\.regionCode/);
  assert.match(publishedSource,/administrativeRegionCode: response\.administrativeRegionCode/);
  assert.match(publishedSource,/\["prefectureCode", \(response\) => response\.prefectureCode\]/);
  assert.match(publishedSource,/publicPrefectureApproved: false/);
});

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  greekRetailSector,
  isRetailKad,
  kadMatches,
  RETAIL_ACTIVITY_GROUP_IDS,
  RETAIL_CLASSIFICATION_VERSION
} from "./research-kad-coverage.ts";

test("frame uses all current retail KAD and an auditable v2 classification", () => {
  assert.deepEqual([...RETAIL_ACTIVITY_GROUP_IDS], ["retail-all"]);
  assert.match(RETAIL_CLASSIFICATION_VERSION, /kad-2025-all-retail-v2/);
});

test("both dotted and undotted KAD representations match without broadening to wholesale", () => {
  assert.ok(kadMatches("47.11.10.01", "47.11"));
  assert.ok(kadMatches("47111001", "47.11"));
  assert.ok(isRetailKad("47.81.00.00"));
  assert.ok(isRetailKad("47910000"));
  assert.equal(isRetailKad("46.49.00.00"), false);
  assert.equal(isRetailKad("56.10.00.00"), false);
});

test("formerly omitted food shops, fuel, pharmacies and vehicle retailers get distinct strata", () => {
  assert.equal(greekRetailSector(["47.11.10.01"]), "food_groceries");
  assert.equal(greekRetailSector(["47.21.00.00"]), "food_groceries");
  assert.equal(greekRetailSector(["47.30.00.00"]), "fuel_retail");
  assert.equal(greekRetailSector(["47.73.00.00"]), "pharmacy_medical");
  assert.equal(greekRetailSector(["47.74.00.00"]), "pharmacy_medical");
  assert.equal(greekRetailSector(["47.81.00.00"]), "automotive_trade");
  assert.equal(greekRetailSector(["47.91.00.00"]), "retail_intermediation");
  assert.equal(greekRetailSector(["47.19.00.00"]), "general_merchandise");
});

test("existing categories remain stable and uncovered division-47 classes have a retail fallback", () => {
  assert.equal(greekRetailSector(["47.71.00.00"]), "fashion_footwear");
  assert.equal(greekRetailSector(["47.75.00.00"]), "beauty_personal_care");
  assert.equal(greekRetailSector(["47.52.00.00"]), "diy_building");
  assert.equal(greekRetailSector(["47.77.00.00"]), "jewellery_watches");
  assert.equal(greekRetailSector(["47.76.00.00"]), "flowers_pets");
  assert.equal(greekRetailSector(["47.79.00.00"]), "second_hand");
  assert.equal(greekRetailSector(["47.78.00.00"]), "other_retail");
});

test("frozen analytical KAD context is complete and guarded before irreversible unlink", () => {
  const migration=readFileSync("db/migrations/0450_research_kad_analysis_context.sql","utf8");
  const identityJob=readFileSync("apps/web/src/lib/research-survey-jobs.ts","utf8");
  const weighted=readFileSync("apps/web/src/lib/research-survey-analysis.ts","utf8");
  const distribution=readFileSync("apps/web/src/lib/research-geographic-distribution-runtime.ts","utf8");
  const relations=readFileSync("apps/web/src/lib/research-geographic-relations-runtime.ts","utf8");
  for(const column of [
    "matched_kad_codes","source_activity_codes","kad_classification_version",
    "kad_source_kind","source_prefecture","postcode_district3"
  ]){
    assert.ok(migration.includes(column),column+" must be included in migration");
    assert.ok(identityJob.includes(column),column+" must be frozen by destruction job");
  }
  assert.match(identityJob,/RESEARCH_IDENTITY_DESTRUCTION_KAD_CONTEXT_INCOMPLETE/);
  assert.match(identityJob,/ON CONFLICT \(response_id\) DO NOTHING/);
  assert.match(weighted,/research_response_design_context ctx/);
  assert.match(distribution,/ctx\.matched_kad_codes/);
  assert.match(relations,/ctx\.matched_kad_codes/);
  assert.match(migration,/research_response_design_context/);
  assert.match(migration,/research_response_design_context_kad_matched_idx/);
});

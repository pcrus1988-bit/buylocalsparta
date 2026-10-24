import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_RESULTS_CHAPTERS, PUBLIC_RESULTS_METRICS } from "./research-public-results-sections.ts";
import { publicResultPoints,demoResultPoints,validRegionValue } from "./research-public-results-data.ts";

test("six major chapters include three research subchapters each and no private experiment",()=>{
 assert.equal(PUBLIC_RESULTS_CHAPTERS.length,6);
 assert.equal(PUBLIC_RESULTS_CHAPTERS.reduce((n,c)=>n+c.subchapters.length,0),18);
 assert.equal(new Set(PUBLIC_RESULTS_METRICS).size,PUBLIC_RESULTS_METRICS.length);
 assert.doesNotMatch(JSON.stringify(PUBLIC_RESULTS_CHAPTERS),/EXP01|randomized_profile|platform_choice_experiment|conjoint/i);
});
function estimate(overrides:Record<string,unknown>={}){
 return {
  metricKey:"digital_readiness.mean",
  segment:{},
  estimate:53.2,
  standardError:2.1,
  confidenceLevel:.95,
  ciLower:48.5,
  ciUpper:57.9,
  unweightedN:84,
  weightedN:115,
  method:"nonresponse_calibrated_stratified_descriptive_v3",
  suppressed:false,
  metadata:{format:"mean"},
  ...overrides
 };
}
test("publication client props block private experiment, suppressed and small cells",()=>{
 const rows=[
  estimate(),
  estimate({metricKey:"platform_choice_experiment.amce.fee"}),
  estimate({metricKey:"digital_readiness.mean",method:"randomized_profile_amce_clustered_v1"}),
  estimate({metricKey:"digital_readiness.mean",metadata:{experimentCode:"EXP01"}}),
  estimate({suppressed:true,estimate:88}),
  estimate({unweightedN:29,estimate:70}),
  estimate({metricKey:"unknown_metric.secret",estimate:88})
 ];
 const out=publicResultPoints(rows as Parameters<typeof publicResultPoints>[0]);
 assert.equal(out.length,1);
 assert.equal(out[0]!.value,53.2);
 assert.deepEqual(out[0]!.segment,{});
 assert.equal("metadata" in out[0]!,false);
});
test("historical prefecture codes cannot silently become regions on the map",()=>{
 assert.equal(validRegionValue("05"),false);
 assert.equal(validRegionValue("ATTICA"),true);
 const rows=[
  estimate({segment:{regionCode:"05"}}),
  estimate({segment:{regionCode:"ATTICA"}}),
  estimate({segment:{sectorCode:"food_groceries",sizeBand:"1"}}),
  estimate({segment:{sectorCode:"food_groceries"}})
 ];
 const out=publicResultPoints(rows as Parameters<typeof publicResultPoints>[0]);
 assert.equal(out.length,2);
 assert.deepEqual(out.map(x=>x.segment),[{regionCode:"ATTICA"},{sectorCode:"food_groceries"}]);
});
test("demo fixtures are deterministic, never leak into published adapters",()=>{
 const demo=demoResultPoints();
 assert.ok(demo.length>200);
 assert.equal(demo.filter(x=>Object.keys(x.segment).length===0).length,PUBLIC_RESULTS_METRICS.length);
 assert.deepEqual(demoResultPoints(),demo);
});

import test from "node:test";
import assert from "node:assert/strict";
import { answerPostcodeHeatField } from "./research-answer-postcode-density.ts";

const locations=[
  {postcode:"23100",latitude:37.0803,longitude:22.4047,region:"PELOPONNESE"},
  {postcode:"23101",latitude:37.0811,longitude:22.4060,region:"PELOPONNESE"},
  {postcode:"24100",latitude:37.0588,longitude:22.1034,region:"PELOPONNESE"},
  {postcode:"11142",latitude:38.0244,longitude:23.747,region:"ATTICA"}
];

test("anonymous detailed image is available for a protected postcode-area cohort",()=>{
  const output=answerPostcodeHeatField([
    {postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",answered:6,matched:2},
    {postcode:"23101",prefecture:"ΛΑΚΩΝΙΑΣ",answered:9,matched:5}
  ],locations);
  assert.equal(output.mappedAnswers,7);
  assert.equal(output.detailMatched,7);
  assert.ok(output.spatialCohorts>0);
  assert.ok(output.countPixels.some((c,i)=>i%4===3&&c>0));
  assert.ok(output.ratePixels.some((c,i)=>i%4===3&&c>0));
  assert.deepEqual(Object.keys(output).sort(),[
    "countPixels","detailMatched","height","mappedAnswers","privacyCoarsenedOrNotRendered",
    "ratePixels","spatialCohorts","unmatchedAnswers","width"
  ]);
});

test("no individual or rare-answer hotspot even when the postcode is valid",()=>{
  const output=answerPostcodeHeatField([
    {postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",answered:2,matched:1},
    {postcode:"11142",prefecture:"ΑΤΤΙΚΗΣ",answered:3,matched:2}
  ],locations);
  assert.equal(output.mappedAnswers,3);
  assert.equal(output.detailMatched,0);
  assert.equal(output.spatialCohorts,0);
  assert.ok(output.countPixels.every(c=>c===0));
  assert.ok(output.ratePixels.every(c=>c===0));
});

test("all answers contribute to counts even when finer groups are suppressed",()=>{
  const output=answerPostcodeHeatField([
    {postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",answered:20,matched:12},
    {postcode:"24100",prefecture:"ΜΕΣΣΗΝΙΑΣ",answered:2,matched:1},
    {postcode:"99999",prefecture:"ΑΤΤΙΚΗΣ",answered:7,matched:5},
    {postcode:"11142",prefecture:"ΛΑΚΩΝΙΑΣ",answered:9,matched:6}
  ],locations);
  assert.equal(output.mappedAnswers,13);
  assert.equal(output.unmatchedAnswers,11);
  assert.equal(output.detailMatched+output.privacyCoarsenedOrNotRendered,13);
});

test("local prevalence uses answered denominator instead of absolute selected density",()=>{
  const high=answerPostcodeHeatField([
    {postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",answered:20,matched:15}
  ],locations);
  const low=answerPostcodeHeatField([
    {postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",answered:60,matched:15}
  ],locations);
  assert.deepEqual(high.countPixels,low.countPixels);
  assert.notDeepEqual(high.ratePixels,low.ratePixels);
});

test("heatmap never leaks a rate at n=10 that read-only viewers cannot inspect",()=>{
  const under=answerPostcodeHeatField([
    {postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",answered:10,matched:5}
  ],locations);
  assert.equal(under.spatialCohorts,0);
  assert.ok(under.countPixels.every(v=>v===0));
  assert.ok(under.ratePixels.every(v=>v===0));
  assert.equal(under.mappedAnswers,5);
  // The same matched count in an adequately powered cell can be visualized.
  const enough=answerPostcodeHeatField([
    {postcode:"23100",prefecture:"ΛΑΚΩΝΙΑΣ",answered:15,matched:5}
  ],locations);
  assert.equal(enough.spatialCohorts,1);
  assert.equal(enough.detailMatched,5);
});

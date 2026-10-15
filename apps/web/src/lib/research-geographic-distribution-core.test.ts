import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDistribution, safeDistributionCounts, safeDistributionRegion
} from "./research-geographic-distribution-core.ts";

test("single-question n includes drafts that skipped every other question", () => {
  const result = aggregateDistribution([
    { prefecture:"ΑΤΤΙΚΗΣ", answered:6, matched:4 },
    { prefecture:"ΑΘΗΝΩΝ", answered:2, matched:1 },
    { prefecture:"ΛΑΚΩΝΙΑΣ", answered:1, matched:1 },
    { prefecture:"", answered:3, matched:2 }
  ]);
  assert.deepEqual(result.national,{answered:12,matched:8});
  assert.deepEqual(result.unknown,{answered:3,matched:2});
  assert.equal(result.mappedMatched,6);
  assert.equal(result.regions.find(x=>x.key==="ATTICA")?.answered,8);
  assert.equal(result.regions.find(x=>x.key==="ATTICA")?.matched,5);
  assert.equal(result.regions.find(x=>x.key==="PELOPONNESE")?.matched,1);
});

test("prevalence differs from geographical share of the selected answer", () => {
  const cell = safeDistributionCounts({answered:20,matched:8},40,true);
  assert.deepEqual(cell, {answered:20,matched:8,prevalence:40,distribution:20});
  const empty=safeDistributionCounts({answered:0,matched:0},0,true);
  assert.deepEqual(empty,{answered:0,matched:0,prevalence:null,distribution:null});
});

test("a matched zero is real zero, not a missing answer, for authorized analysts", () => {
  assert.deepEqual(safeDistributionCounts({answered:7,matched:0},3,true),
    {answered:7,matched:0,prevalence:0,distribution:0});
});

test("read-only users do not receive small-cell numerator or share", () => {
  assert.deepEqual(safeDistributionCounts({answered:14,matched:3},100,false),
    {answered:null,matched:null,prevalence:null,distribution:null});
  assert.deepEqual(safeDistributionCounts({answered:20,matched:2},100,false),
    {answered:20,matched:null,prevalence:null,distribution:null});
  assert.deepEqual(safeDistributionCounts({answered:20,matched:19},100,false),
    {answered:20,matched:null,prevalence:null,distribution:null});
  assert.deepEqual(safeDistributionCounts({answered:25,matched:10},100,false),
    {answered:25,matched:10,prevalence:40,distribution:10});
  const result=aggregateDistribution([{prefecture:"ΧΑΝΙΩΝ",answered:1,matched:1}]);
  const crete=result.regions.find(r=>r.key==="CRETE")!;
  assert.deepEqual(safeDistributionRegion(crete,1,false),{
    key:"CRETE",label:crete.label,answered:null,matched:null,prevalence:null,distribution:null
  });
});

test("shares are computed against mapped matches, excluding unknown geography",()=>{
  const result=aggregateDistribution([
    {prefecture:"ΑΤΤΙΚΗΣ",answered:20,matched:10},
    {prefecture:"ΧΑΝΙΩΝ",answered:20,matched:10},
    {prefecture:"",answered:10,matched:9}
  ]);
  assert.equal(result.national.matched,29);
  assert.equal(result.mappedMatched,20);
  assert.equal(safeDistributionRegion(result.regions.find(x=>x.key==="ATTICA")!,20,true).distribution,50);
});

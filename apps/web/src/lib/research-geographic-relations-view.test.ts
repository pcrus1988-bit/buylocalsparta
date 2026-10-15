import test from "node:test";
import assert from "node:assert/strict";
import {
  relationshipMapCellValue, relationshipRegionValue, sortedRelationshipRegions, safeRelationshipRegionsCsv
} from "./research-geographic-relations-view.ts";
import type { SafeRelationshipRegion } from "./research-geographic-relations-core.ts";

const region = (key:string, label:string, a:number|null, b:number|null,
  baseA:number|null=24, baseB:number|null=32):SafeRelationshipRegion => ({
  key:key as SafeRelationshipRegion["key"], label,
  segment:{base:baseA,percent:a},other:{base:baseB,percent:b}
});

test("map switches between A, other respondents and percentage-point gap",()=>{
  const r=region("ATTICA","Αττική",56,34);
  assert.equal(relationshipRegionValue(r,"segment").value,56);
  assert.equal(relationshipRegionValue(r,"other").value,34);
  assert.equal(relationshipRegionValue(r,"gap").value,22);
  assert.equal(relationshipMapCellValue(-15,"gap"),"−15 π.μ.");
  assert.equal(relationshipMapCellValue(null,"gap"),"Ανεπαρκής βάση");
});

test("suppressed group never produces a gap nor an inferred denominator",()=>{
  const r=region("CRETE","Κρήτη",null,60,null,30);
  assert.deepEqual(relationshipRegionValue(r,"gap"),{value:null,base:null,available:false});
  assert.equal(relationshipRegionValue(r,"segment").base,null);
});

test("ranking keeps suppressed regional cells after all available results",()=>{
  const regions=[
    region("ATTICA","Αττική",60,25),
    region("CRETE","Κρήτη",null,50,null,30),
    region("PELOPONNESE","Πελοπόννησος",45,65)
  ];
  assert.deepEqual(sortedRelationshipRegions(regions,"segment","highest").map(x=>x.key),
    ["ATTICA","PELOPONNESE","CRETE"]);
  assert.deepEqual(sortedRelationshipRegions(regions,"gap","lowest").map(x=>x.key),
    ["PELOPONNESE","ATTICA","CRETE"]);
  assert.deepEqual(sortedRelationshipRegions(regions,"other","highest").map(x=>x.key),
    ["PELOPONNESE","CRETE","ATTICA"]);
});

test("export contains only safe aggregates, with withheld cells marked rather than zero",()=>{
  const csv=safeRelationshipRegionsCsv([
    region("ATTICA","Αττική",60,25,20,31),
    region("CRETE","Κρήτη",null,null,null,null)
  ]);
  assert.match(csv,/Αττική/);
  assert.match(csv,/Κρήτη/);
  assert.match(csv,/"60"/);
  assert.match(csv,/"—"/);
  assert.ok(!csv.includes("null"));
  assert.ok(!csv.includes("undefined"));
});

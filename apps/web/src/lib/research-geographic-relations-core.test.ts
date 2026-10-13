import test from "node:test";
import assert from "node:assert/strict";
import {
  RESEARCH_RELATIONSHIP_PRESETS, RELATIONSHIP_MIN_BASE,
  aggregateRelationship, safeRelationshipCounts, safeRelationshipRegion
} from "./research-geographic-relations-core.ts";

test("preset relationships reference distinct survey questions and real answer buckets",()=>{
  assert.ok(RESEARCH_RELATIONSHIP_PRESETS.length>=8);
  for(const p of RESEARCH_RELATIONSHIP_PRESETS){
    assert.notEqual(p.a,p.b,p.id);
    assert.ok(p.av.length>0&&p.bv.length>0,p.id);
  }
  const first=RESEARCH_RELATIONSHIP_PRESETS.find(p=>p.id==="micro_local")!;
  assert.deepEqual([...first.av],["1","2_4"]);
  assert.deepEqual([...first.bv],["51_75","76_100"]);
  assert.match(first.aLabel,/1–4/);
});

test("the same respondent only contributes to its prefecture and segment",()=>{
  const actual=aggregateRelationship([
    {prefecture:"ΑΤΤΙΚΗΣ",segment:true,answered:20,selected:12},
    {prefecture:"ΑΘΗΝΩΝ",segment:true,answered:10,selected:5},
    {prefecture:"ΑΤΤΙΚΗΣ",segment:false,answered:30,selected:9},
    {prefecture:"ΧΑΝΙΩΝ",segment:true,answered:10,selected:7},
    {prefecture:"",segment:false,answered:1,selected:1}
  ]);
  assert.deepEqual(actual.nationalSegment,{answered:40,selected:24});
  assert.deepEqual(actual.nationalOther,{answered:31,selected:10});
  const attica=actual.regions.find(r=>r.key==="ATTICA")!;
  assert.deepEqual(attica.segment,{answered:30,selected:17});
  assert.deepEqual(attica.other,{answered:30,selected:9});
  assert.equal(actual.unknown,1);
});

test("no small base or small outcome partition discloses percent",()=>{
  assert.equal(RELATIONSHIP_MIN_BASE,15);
  assert.deepEqual(safeRelationshipCounts({answered:14,selected:7}),{base:null,percent:null});
  assert.deepEqual(safeRelationshipCounts({answered:15,selected:4}),{base:15,percent:null});
  assert.deepEqual(safeRelationshipCounts({answered:20,selected:16}),{base:20,percent:null});
  assert.deepEqual(safeRelationshipCounts({answered:20,selected:10}),{base:20,percent:50});
  const r=aggregateRelationship([
    {prefecture:"ΚΥΚΛΑΔΩΝ",segment:true,answered:3,selected:1}
  ]).regions.find(x=>x.key==="SOUTH AEGEAN")!;
  assert.deepEqual(safeRelationshipRegion(r).segment,{base:null,percent:null});
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { EXTERNAL_GROUPS, EXTERNAL_STUDIES, externalChange, externalCsv, externalGroup } from "./research-external-analysis.ts";

test("annual sentiment uses a consistent source vintage and complete years only", () => {
  const group=externalGroup("annual-esi");
  assert.ok(group);
  assert.equal(group.comparison,"direct");
  assert.deepEqual(group.series.find(s=>s.id==="esi-gr")?.points.map(p=>[p.year,p.value]),[[2022,104.9],[2023,107.2],[2024,107.6],[2025,107.4]]);
  assert.ok(group.series.every(s=>s.points.every(p=>p.year<=2025)));
  assert.equal(externalChange(95.8,107.4),11.6);
});
test("2026 monthly overlay never fills unavailable observations",()=>{
  for(const id of ["monthly-esi","retail-monthly"]){
    const group=externalGroup(id);assert.ok(group);
    assert.ok(group.series.some(s=>s.points.some(p=>p.year===2025)));
    assert.ok(group.series.some(s=>s.points.some(p=>p.year===2026)));
    assert.ok(group.series.filter(s=>s.points[0]?.year===2026).every(s=>s.points.length===9&&s.points.at(-1)?.period==="09"));
  }
});
test("retail national index is never co-charted with EC retail balances",()=>{
  const retail=externalGroup("retail-september");const balances=externalGroup("annual-balances");
  assert.ok(retail&&balances);
  assert.notEqual(retail.id,balances.id);
  assert.equal(retail.unit,"index");
  assert.equal(balances.unit,"balance");
  assert.equal(balances.comparison,"trend-only");
});
test("supermarket inflation uses pp differences not compounded price levels",()=>{
  const group=externalGroup("supermarket-prices");assert.ok(group);
  assert.deepEqual(group.series[0].points.map(p=>p.value),[0.61,-0.75]);
  assert.equal(externalChange(0.61,-0.75),-1.36);
});
test("all observations have unique keys and traceable sources",()=>{
  const ids=new Set(EXTERNAL_STUDIES.map(s=>s.id));
  for(const group of EXTERNAL_GROUPS){
    assert.ok(group.sourceIds.length>0);
    for(const id of group.sourceIds)assert.ok(ids.has(id),id);
    for(const series of group.series){
      const points=new Set(series.points.map(p=>p.year+":"+p.period));
      assert.equal(points.size,series.points.length,group.id+"/"+series.id);
    }
  }
});
test("CSV only exports chosen series and obeys year range",()=>{
  const group=externalGroup("annual-esi");assert.ok(group);
  const csv=externalCsv(group,["esi-gr"],2023,2024);
  assert.ok(csv.includes('"2023"'));
  assert.ok(csv.includes('"2024"'));
  assert.ok(!csv.includes('"2022"'));
  assert.ok(!csv.includes('"2025"'));
  assert.ok(!csv.includes('"ΕΕ-27"'));
});

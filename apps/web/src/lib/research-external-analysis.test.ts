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


test("new household surveys are tracked as nominal, dated observations",()=>{
  const spend=externalGroup("household-spending-history");
  assert.ok(spend);
  assert.equal(spend.unit,"euro");
  assert.deepEqual(spend.series[0].points.map(p=>p.year),[2019,2020,2021,2022,2023,2024,2025]);
  assert.deepEqual(spend.series[0].points.slice(-2).map(p=>p.value),[1724.54,1820.2]);
  assert.ok(spend.caution.includes("τρέχοντα ευρώ"));
  const shares=externalGroup("household-budget-mix");
  assert.ok(shares);
  assert.deepEqual(shares.series.find(s=>s.id==="hbs-food-share")?.points.map(p=>p.value),[20.7,20.4]);
  assert.equal(shares.comparison,"trend-only");
});

test("ELSTAT nominal and real indices are distinct with 2026 partial-year boundary",()=>{
  const annualRetail=externalGroup("retail-annual-2024-2025");
  const monthlyRetail=externalGroup("retail-2026-monthly-indices");
  const sectorRetail=externalGroup("retail-sectors-2026");
  assert.ok(annualRetail&&monthlyRetail&&sectorRetail);
  assert.equal(annualRetail.comparison,"trend-only");
  assert.deepEqual(annualRetail.series.find(s=>s.id==="retail-turnover-annual")?.points.map(p=>p.value),[118.4,122.2]);
  assert.deepEqual(annualRetail.series.find(s=>s.id==="retail-volume-annual")?.points.map(p=>p.value),[98.2,100.3]);
  assert.ok(monthlyRetail.series.every(s=>s.points.length===7 && s.points.at(-1)?.period==="07"));
  assert.ok(sectorRetail.series.every(s=>s.points.length===7 && s.points.at(-1)?.period==="07"));
  assert.ok(monthlyRetail.caution.includes("Ιούλιος προσωρινός"));
});

test("June comparison names the source vintage and revision",()=>{
  const june=externalGroup("retail-june-growth");
  assert.ok(june);
  assert.deepEqual(june.series.find(s=>s.id==="june-turnover-growth")?.points.map(p=>p.value),[3.0,4.2]);
  assert.ok(june.caution.includes("+4,1%"));
  assert.ok(june.sourceIds.includes("elstat-june-2025")&&june.sourceIds.includes("elstat-june-2026"));
});

test("merchant and consumer survey outcomes remain descriptive, not composite statistics",()=>{
  for(const groupId of ["esee-summer-2025-survey","ielka-food-choice-2025","ielka-offers-2025"]){
    const group=externalGroup(groupId);
    assert.ok(group);
    assert.equal(group.comparison,"descriptive");
    assert.ok(group.series.every(s=>s.points.length===1));
  }
  assert.deepEqual(externalGroup("esee-summer-2025-survey")?.series.map(s=>s.points[0].value),[59,51,47,37]);
  assert.deepEqual(externalGroup("ielka-food-choice-2025")?.series.map(s=>s.points[0].value),[47,30]);
});

test("the expanded atlas has no duplicate studies, only traceable https sources",()=>{
  assert.equal(EXTERNAL_STUDIES.length,30);
  assert.equal(EXTERNAL_GROUPS.length,25);
  assert.equal(new Set(EXTERNAL_STUDIES.map(s=>s.id)).size,EXTERNAL_STUDIES.length);
  assert.equal(new Set(EXTERNAL_GROUPS.map(g=>g.id)).size,EXTERNAL_GROUPS.length);
  assert.ok(EXTERNAL_STUDIES.every(s=>s.url.startsWith("https://")));
  for(const group of EXTERNAL_GROUPS){
    assert.ok(group.series.length<=6);
    assert.ok(group.series.every(s=>s.points.every(p=>p.year<=2026)));
  }
});

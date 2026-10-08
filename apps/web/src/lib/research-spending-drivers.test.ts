import assert from "node:assert/strict";
import { test } from "node:test";
import { EXTERNAL_STUDIES, externalGroup } from "./research-external-analysis.ts";
import {
  DRIVER_ROWS, SILC_EQUIVALISED_INCOME_REFYEAR, HICP_ANNUAL_2015_BASE,
  DRIVERS_SOURCES, inflationAdjusted, indexedDrivers,
  spendingIncomePairs, pearsonCorrelation, spendingDriversCsv
} from "./research-spending-drivers.ts";

test("SILC survey year is NOT income reference year",()=>{
  assert.equal(SILC_EQUIVALISED_INCOME_REFYEAR[2024],13381);
  assert.equal(SILC_EQUIVALISED_INCOME_REFYEAR[2025],undefined);
  assert.equal(DRIVER_ROWS.find(p=>p.year===2024)?.income,13381);
  assert.equal(DRIVER_ROWS.find(p=>p.year===2025)?.income,null);
  assert.deepEqual(externalGroup("income-refyear")?.series[0].points.slice(-2).map(p=>[p.year,p.value]),[[2023,12391],[2024,13381]]);
});

test("annual mean Eurostat HICP is aligned with HBS calendar year, 2019–2025",()=>{
  assert.deepEqual(DRIVER_ROWS.map(p=>p.year),[2019,2020,2021,2022,2023,2024,2025]);
  assert.deepEqual(DRIVER_ROWS.map(p=>p.priceIndex),[102.5,101.2,101.8,111.2,115.8,119.3,122.8]);
  assert.equal(DRIVER_ROWS.find(p=>p.year===2024)?.spending,1724.54);
  assert.equal(DRIVER_ROWS.find(p=>p.year===2025)?.spending,1820.2);
  assert.ok(DRIVER_ROWS.every(p=>Number.isFinite(p.realSpending)));
  assert.ok(DRIVER_ROWS[DRIVER_ROWS.length-1].realSpendingYoY!>0);
  assert.ok(DRIVER_ROWS[DRIVER_ROWS.length-1].realSpendingYoY! < DRIVER_ROWS[DRIVER_ROWS.length-1].nominalSpendingYoY!);
});

test("deflator is reversible, normalizes to 2019, and does not imply monthly precision",()=>{
  assert.equal(inflationAdjusted(100,2019),100);
  assert.equal(inflationAdjusted(100,2026),null);
  const adjusted=inflationAdjusted(1234,2024)!;
  assert.ok(Math.abs(adjusted*HICP_ANNUAL_2015_BASE[2024]/HICP_ANNUAL_2015_BASE[2019]-1234)<1e-7);
  const normalized=indexedDrivers("realSpending",2019,2025);
  assert.equal(normalized[0].value,100);
  assert.equal(normalized.length,7);
  assert.equal(indexedDrivers("income",2019,2025).length,6);
});

test("matched years respect SILC income reference and optional spending lag",()=>{
  const same=spendingIncomePairs({from:2019,to:2025,lag:0,real:false});
  assert.equal(same.length,6);
  assert.equal(same[0].incomeYear,2019);assert.equal(same[0].spendingYear,2019);
  assert.equal(same.at(-1)?.income,13381);assert.equal(same.at(-1)?.spendingYear,2024);
  assert.ok(!same.some(p=>p.incomeYear===2025));
  const lag=spendingIncomePairs({from:2019,to:2025,lag:1,real:false});
  assert.equal(lag.length,6);
  assert.equal(lag[0].incomeYear,2019);assert.equal(lag[0].spendingYear,2020);
  assert.equal(lag.at(-1)?.spendingYear,2025);
  assert.equal(lag.at(-1)?.income,13381);
  const real=spendingIncomePairs({from:2019,to:2025,lag:0,real:true});
  assert.ok(real[2].spending!==same[2].spending);
});

test("Pearson refuses tiny samples, constant inputs, and constrains result to [-1,1]",()=>{
  const pairs=spendingIncomePairs({from:2019,to:2025,lag:0,real:true});
  assert.equal(pearsonCorrelation(pairs.slice(0,4)),null);
  assert.equal(pearsonCorrelation(pairs.map(p=>({...p,income:5}))),null);
  const corr=pearsonCorrelation(pairs);
  assert.ok(corr!==null && Number.isFinite(corr));
  assert.ok(corr!>=-1&&corr!<=1);
});

test("CSV clearly exposes two year dimensions and original study sources",()=>{
  const csv=spendingDriversCsv(2019,2025,0,true);
  assert.ok(csv.includes("income_reference_year,spending_year"));
  assert.ok(csv.includes(DRIVERS_SOURCES.silc));
  assert.ok(csv.includes(DRIVERS_SOURCES.hbs));
  assert.ok(csv.includes(DRIVERS_SOURCES.prices));
  assert.equal(csv.trim().split("\n").length,7);
  assert.ok(!csv.includes('"2025","2025"'));
});

test("income, price and wellbeing source groups have primary provenance and distinct methods",()=>{
  for(const id of ["income-refyear","hicp-annual-index","hicp-annual-inflation","greek-cpi-2025-categories","income-inequality-2019-2025","gsevee-days-2023-2025","gsevee-budget-2025"]){
    const group=externalGroup(id);
    assert.ok(group,id);
    assert.ok(group.sourceIds.length>=1);
    for(const sourceId of group.sourceIds)assert.ok(EXTERNAL_STUDIES.some(s=>s.id===sourceId));
  }
  assert.equal(externalGroup("gsevee-days-2023-2025")?.unit,"days");
  assert.equal(externalGroup("greek-cpi-2025-categories")?.comparison,"descriptive");
  assert.equal(externalGroup("income-refyear")?.unit,"euro");
  assert.deepEqual(externalGroup("gsevee-days-2023-2025")?.series[0].points.map(p=>p.value),[19,19,18]);
});

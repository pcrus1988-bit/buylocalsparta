// Synthetic fixture values only. NEVER copy embargoed research estimates into public repo tests.
import test from "node:test";
import assert from "node:assert/strict";
import {
  scientificReadingSummary, scientificReadingCharts, scientificReadingIndices
} from "./research-scientific-reading.ts";
import type { SafePublicResultPoint } from "./research-public-results-data.ts";

function point(metricKey:string,value:number,n:number,segment:Record<string,string>={},format:"proportion"|"mean"="proportion"):SafePublicResultPoint {
  return {metricKey,label:"",value,n,segment,format,ciLower:null,ciUpper:null};
}

test("derives per-sent completion ratio without claiming a census response rate",()=>{
  const summary=scientificReadingSummary({
    fieldwork:{selected:1000,sent:800,delivered:750,started:65,completed:35,analyzed:34,qualityExcluded:1},
    protocolEvidence:{events:[{title:"Administrative recovery of complete questionnaires"},{title:"Owner-directed early closure of Greek Retail 2026 fieldwork"}]},
    disclosure:{confidenceIntervalsPublished:false}
  });
  assert.equal(summary.selected,1000);
  assert.equal(summary.completed,35);
  assert.equal(summary.analysed,34);
  assert.equal(summary.excluded,1);
  assert.equal(summary.completionsPerSent,35/800);
  assert.equal(summary.administrativelyFinalised,true);
  assert.equal(summary.earlyCloseDocumented,true);
  assert.equal(summary.hasConventionalSamplingIntervals,false);
});

test("missing or invalid study metadata fails safely instead of inventing counts or rates",()=>{
  const empty=scientificReadingSummary({});
  assert.equal(empty.sent,null);
  assert.equal(empty.completionsPerSent,null);
  assert.equal(empty.administrativelyFinalised,false);
  const invalid=scientificReadingSummary({fieldwork:{sent:0,completed:10,analyzed:-3,qualityExcluded:"5"}});
  assert.equal(invalid.completionsPerSent,null);
  assert.equal(invalid.analysed,null);
  assert.equal(invalid.excluded,null);
  assert.equal(scientificReadingSummary({fieldwork:{sent:8,completed:12}}).completionsPerSent,null);
});

test("scientific charts use only independent nationwide approved estimates and own denominators",()=>{
  const charts=scientificReadingCharts([
    point("digital_capabilities.tax.share.yes",.67,87),
    point("digital_capabilities.stock_sync.share.yes",.29,83),
    point("digital_capabilities.tax.share.yes",.99,10,{prefectureCode:"Lakonia"}),
    point("economic_viability_pressures.share.taxation",.34,34),
    point("business_financial_trends_12m.operating_costs.share.increased",.48,34),
    point("customer_acquisition_sources.share.footfall",.736,34),
    point("customer_acquisition_sources.share.google",.398,34),
    point("customer_acquisition_sources.share.word_of_mouth",.555,34),
    point("digital_capabilities.catalog.share.yes",.27,4),
    point("economic_viability_pressures.share.purchasing_power",2.4,34),
  ]);
  const digital=charts.find(chart=>chart.id==="digital");
  assert.ok(digital);
  assert.equal(digital.rows.length,2);
  assert.deepEqual(digital.rows.map(row=>[row.value,row.n]),[[.67,87],[.29,83]]);
  assert.ok(digital.note.includes("διαφορετική βάση n"));
  const economy=charts.find(chart=>chart.id==="economy");
  assert.deepEqual(economy?.rows.map(row=>row.key),[
    "business_financial_trends_12m.operating_costs.share.increased",
    "economic_viability_pressures.share.taxation",
  ]);
  assert.equal(charts.find(chart=>chart.id==="customers")?.rows.length,3);
});

test("indices never invent a score or mix a prefecture value into national",()=>{
  const indices=scientificReadingIndices([
    point("digital_readiness.mean",45.987,571,{},"mean"),
    point("digital_readiness.mean",87,5,{prefectureCode:"Lakonia"},"mean"),
    point("retail_friction.mean",44,564,{},"mean"),
    point("retail_confidence.mean",150,558,{},"mean"),
  ]);
  assert.equal(indices.length,2);
  assert.equal(indices[0]?.n,571);
  assert.equal(indices[0]?.value,45.987);
});

test("private experiment keys are not chart definitions",()=>{
  const points=[point("platform_choice_experiment.amce.commission_pct.12",-.124,429)];
  assert.deepEqual(scientificReadingCharts(points),[]);
  assert.deepEqual(scientificReadingIndices(points),[]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
 PUBLIC_MAP_QUESTIONS,safeMapSelection,mapAnswers,mapLegendDomain,mapColorStrength
} from "./research-public-map-questions.ts";
import {demoResultPoints,publicResultPoints} from "./research-public-results-data.ts";

test("public map uses distinct survey questions with approved answer options only",()=>{
 assert.ok(PUBLIC_MAP_QUESTIONS.length>=18);
 assert.equal(new Set(PUBLIC_MAP_QUESTIONS.map(x=>x.id)).size,PUBLIC_MAP_QUESTIONS.length);
 for(const question of PUBLIC_MAP_QUESTIONS){
  assert.ok(question.metricKeys.length>0,question.id+" has no published metric definitions");
  assert.ok(question.fullLabel.length>12);
  assert.equal(new Set(question.metricKeys).size,question.metricKeys.length);
  assert.doesNotMatch(JSON.stringify(question),/EXP01|amce|conjoint|randomized_profile|platform_choice_experiment/i);
 }
});
test("answer changing within a question changes metric key; changing question resets answer",()=>{
 const q9=safeMapSelection("Q09","customer_acquisition_sources.share.word_of_mouth");
 const google=safeMapSelection("Q09","customer_acquisition_sources.share.google");
 assert.equal(q9.question.id,"Q09");
 assert.notEqual(q9.answer,google.answer);
 const next=safeMapSelection("Q27",google.answer);
 assert.equal(next.question.id,"Q27");
 assert.equal(next.answer,"economic_viability_pressures.share.purchasing_power");
 assert.equal(mapAnswers(next.question)[0]!.key,next.answer);
 assert.equal(safeMapSelection("not-real","secret").question.id,"Q09");
});
test("map heat gradient uses 0–100% for proportions and true questionnaire score ranges",()=>{
 assert.deepEqual(mapLegendDomain("customer_acquisition_sources.share.google","proportion",[.2,.8]),
  {minimum:0,maximum:1,unit:"%"});
 assert.deepEqual(mapLegendDomain("digital_readiness.mean","mean",[40,65]),
  {minimum:0,maximum:100,unit:"/100"});
 assert.deepEqual(mapLegendDomain("operational_friction.stock.mean","mean",[1.7,3.9]),
  {minimum:1,maximum:5,unit:"/5"});
 assert.deepEqual(mapLegendDomain("acquisition_difficulty_change.mean","mean",[4.3,7.2]),
  {minimum:0,maximum:10,unit:"/10"});
 assert.equal(mapColorStrength(0,{minimum:0,maximum:1}),0);
 assert.equal(mapColorStrength(1,{minimum:0,maximum:1}),1);
 assert.equal(mapColorStrength(-12,{minimum:0,maximum:1}),0);
});
test("different answers produce different demo maps, reproducibly and without real respondents",()=>{
 const demo=demoResultPoints();
 const forMetric=(key:string)=>demo.filter(p=>p.metricKey===key&&p.segment.regionCode).map(p=>p.value);
 const first=forMetric("customer_acquisition_sources.share.word_of_mouth");
 const second=forMetric("customer_acquisition_sources.share.google");
 const third=forMetric("economic_viability_pressures.share.suppliers");
 assert.equal(first.length,13);
 assert.equal(second.length,13);
 assert.notDeepEqual(first,second);
 assert.notDeepEqual(second,third);
 assert.ok(new Set(first).size>=10);
 assert.deepEqual(demoResultPoints(),demo);
 // Raw private experimental outputs must remain filtered even if offered to adapter.
 assert.deepEqual(publicResultPoints([{
   metricKey:"platform_choice_experiment.amce.commission",
   estimate:.55,standardError:null,confidenceLevel:null,ciLower:null,ciUpper:null,
   unweightedN:100,weightedN:null,method:"randomized_profile_amce_clustered_v1",
   suppressed:false,metadata:{format:"proportion"},segment:{regionCode:"ATTICA"}
 }]),[]);
});

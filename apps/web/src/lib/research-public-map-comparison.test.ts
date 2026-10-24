import test from "node:test";
import assert from "node:assert/strict";
import {
 nationalAnswerEstimate,nationalParticipationTotal,regionalParticipationShare,
 mapNationalDifference,nationalCoverageNote
} from "./research-public-map-comparison.ts";
import { demoResultPoints } from "./research-public-results-data.ts";

test("all-Greece result is independent released national estimate, not a sum of region percentages",()=>{
 const metric="customer_acquisition_sources.share.google";
 const points=demoResultPoints();
 const total=nationalAnswerEstimate(points,metric);
 const regions=points.filter(x=>x.metricKey===metric&&x.segment.regionCode);
 assert.ok(total);
 assert.ok(regions.length===13);
 assert.deepEqual(total.segment,{});
 assert.equal(total.n,820);
 assert.equal(total.format,"proportion");
 assert.ok(total.value>0&&total.value<1);
 assert.ok(regions.some(x=>x.value!==total.value));
 assert.equal(nationalAnswerEstimate(regions,metric),undefined);
 const all=regions.reduce((acc,p)=>acc+p.value,0);
 assert.notEqual(total.value,all,"regional percentages must never be added");
});
test("missing national estimate does not fall back to regional mean or 0%",()=>{
 const points=demoResultPoints().filter(p=>p.segment.regionCode);
 assert.equal(nationalAnswerEstimate(points,"digital_readiness.mean"),undefined);
 assert.equal(nationalAnswerEstimate(points,"EXP01.choice_share"),undefined);
 assert.equal(mapNationalDifference(.65,undefined,true),undefined);
});
test("regional answer differences use percentage points, scores keep score units",()=>{
 assert.ok(Math.abs(mapNationalDifference(.64,.54,true)!-10)<1e-8);
 assert.equal(mapNationalDifference(62,55,false),7);
 assert.equal(mapNationalDifference(undefined,.4,true),undefined);
});
test("participation percentages have explicit independently verified national denominator",()=>{
 const source={
  nationalStarted:1000,
  regions:[{key:"ATTICA",label:"Αττική",started:300},{key:"CRETE",label:"Κρήτη",started:120}]
 };
 const total=nationalParticipationTotal(source);
 assert.equal(total,1000);
 assert.equal(regionalParticipationShare(300,total),.3);
 assert.equal(regionalParticipationShare(120,total),.12);
 assert.equal(regionalParticipationShare(12,undefined),undefined);
 assert.equal(regionalParticipationShare(1300,total),undefined);
 assert.equal(nationalParticipationTotal({regions:source.regions}),undefined);
 assert.equal(nationalParticipationTotal({regions:[],nationalStarted:0}),undefined);
 assert.match(nationalCoverageNote(2,420,total),/42%/);
 assert.match(nationalCoverageNote(2,420,undefined),/Μη διαθέσιμο/);
});

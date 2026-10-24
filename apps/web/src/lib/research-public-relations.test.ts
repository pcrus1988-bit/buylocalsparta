import {test} from "node:test";
import assert from "node:assert/strict";
import { RESEARCH_PUBLIC_CHAPTERS } from "./research-public-chapters.ts";
import { RESEARCH_PUBLIC_RELATIONS, computeResearchPublicRelations } from "./research-public-relations.ts";

test("exactly six distinct chapters and eleven auditable cross-question comparisons",() => {
  assert.equal(RESEARCH_PUBLIC_CHAPTERS.length,6);
  assert.equal(new Set(RESEARCH_PUBLIC_CHAPTERS.map(c=>c.id)).size,6);
  assert.equal(RESEARCH_PUBLIC_RELATIONS.length,11);
  const ids = new Set(RESEARCH_PUBLIC_RELATIONS.map(r=>r.id));
  for (const chapter of RESEARCH_PUBLIC_CHAPTERS) {
    assert.ok(chapter.metrics.length>=4);
    assert.ok(chapter.relationIds.length>0);
    for (const id of chapter.relationIds) assert.ok(ids.has(id));
    assert.doesNotMatch(JSON.stringify(chapter),/EXP01|platform_choice_experiment/);
  }
});

test("a contrast uses actual respondent weights, not unweighted percentages",() => {
  const records = [
    ...Array.from({length:30},(_,i)=>({
      finalWeight:i===0?30:1, answers:{
        Q21:{operating_costs:"increased",profitability:i===0?"decreased":"stable"}
      }
    })),
    ...Array.from({length:30},(_,i)=>({
      finalWeight:1, answers:{
        Q21:{operating_costs:"stable",profitability:i<15?"decreased":"stable"}
      }
    }))
  ];
  const result=computeResearchPublicRelations(records).find(x=>x.id==="costs-and-profit");
  assert.ok(result);
  assert.equal(result.suppressed,false);
  assert.equal(result.sampleN,60);
  assert.equal(result.metadata.groupAN,30);
  assert.equal(result.metadata.groupBN,30);
  assert.equal(result.metadata.groupAPositiveN,1);
  assert.equal(result.metadata.groupBPositiveN,15);
  assert.ok(Math.abs(result.difference! -(30/59-0.5))<1e-12);
  assert.equal(result.metadata.uncertaintyWithheldReason,"design_based_contrast_variance_not_validated");
  assert.equal(result.metadata.preregistered,false);
});

test("subgroups with fewer than 30 valid answers are suppressed without leaking their shares",() => {
  const records=[
    ...Array.from({length:29},()=>({finalWeight:1,answers:{Q02:"1",Q21:{profitability:"decreased"}}})),
    ...Array.from({length:45},()=>({finalWeight:1,answers:{Q02:"5_9",Q21:{profitability:"stable"}}}))
  ];
  const result=computeResearchPublicRelations(records).find(x=>x.id==="size-and-profit")!;
  assert.equal(result.suppressed,true);
  assert.equal(result.difference,null);
  assert.equal(result.metadata.groupAShare,null);
  assert.equal(result.metadata.groupBShare,null);
  assert.equal(result.metadata.groupAN,null);
});

test("explicit unknown, refusal and missing outcome are never coded as negative",() => {
  const records=[
    ...Array.from({length:30},()=>({finalWeight:1,answers:{Q21:{operating_costs:"increased",profitability:"decreased"}}})),
    ...Array.from({length:30},()=>({finalWeight:1,answers:{Q21:{operating_costs:"stable",profitability:"unknown"}}}))
  ];
  const result=computeResearchPublicRelations(records).find(x=>x.id==="costs-and-profit")!;
  assert.equal(result.suppressed,true);
  assert.equal(result.sampleN,30);
});

test("the choice experiment never enters any public chapter or relationship registry",() => {
  assert.doesNotMatch(JSON.stringify(RESEARCH_PUBLIC_CHAPTERS),/EXP01|experiment|amce|commission_pct/);
  assert.doesNotMatch(
    JSON.stringify(RESEARCH_PUBLIC_RELATIONS.map(({id,title,questionCodes})=>({id,title,questionCodes}))),
    /EXP01|experiment|amce|commission_pct/
  );
});

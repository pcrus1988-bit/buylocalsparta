import assert from "node:assert/strict";
import {test} from "node:test";
import {SPORT_ACTIVITIES,sportQuestionSequence,sportQuestion,applySportAnswer,sportAnswerPayload} from "../src/lib/sport-fit-questions.ts";
test("supports all eleven web Studio sports with one-question-at-a-time progression",()=>{
 assert.equal(SPORT_ACTIVITIES.length,11);
 for(const {key} of SPORT_ACTIVITIES){
  const steps=sportQuestionSequence(key);
  assert.equal(steps[0],"activity");
  assert.equal(steps[1],"audience");
  assert.ok(steps.includes("size"));
  assert.ok(steps.includes("footLength"));
  assert.equal(steps.at(-1),"budget");
  for(const q of steps)assert.ok(sportQuestion(key,q).title.length>3);
 }
 assert.ok(sportQuestionSequence("running").includes("runnerNeed"));
 assert.ok(sportQuestionSequence("gym").includes("gymTraining"));
 assert.ok(!sportQuestionSequence("tennis").includes("runnerNeed"));
});
test("size and foot-length validation never manufactures technical eligibility",()=>{
 const start={activity:"running",audience:"men"} as const;
 const sized=applySportAnswer(start,"size","42,5");
 assert.equal(sized.size,"42.5");
 const measured=applySportAnswer(sized,"footLength","265.5");
 assert.equal(measured.footLengthMm,265.5);
 assert.deepEqual(sportAnswerPayload(measured),measured);
 for(const value of ["-1","abc","99",">42"])assert.throws(()=>applySportAnswer(start,"size",value));
 for(const value of ["NaN","50","450"])assert.throws(()=>applySportAnswer(start,"footLength",value));
});
test("sport-specific surfaces and use cases are rejected for wrong activity",()=>{
 const football={activity:"football",audience:"kids"} as const;
 assert.equal(applySportAnswer(football,"surface","artificial").surface,"artificial");
 assert.throws(()=>applySportAnswer(football,"surface","court_clay"));
 assert.throws(()=>applySportAnswer(football,"runnerNeed","speed"));
 assert.throws(()=>applySportAnswer(football,"useCase","race_day"));
 const reset=applySportAnswer({...football,surface:"artificial"},"activity","tennis");
 assert.equal(reset.activity,"tennis");
 assert.equal(reset.surface,undefined);
});
test("budget normalization caps at the same maximum as the existing engine",()=>{
 const a={activity:"walking",audience:"women"} as const;
 assert.equal(applySportAnswer(a,"budget","120,50").budgetMinor,12050);
 assert.throws(()=>applySportAnswer(a,"budget","6000"));
 assert.throws(()=>applySportAnswer(a,"budget","-1"));
 assert.equal(sportAnswerPayload(a).size,undefined);
});

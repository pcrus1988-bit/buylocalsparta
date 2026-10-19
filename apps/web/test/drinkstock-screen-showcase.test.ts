import assert from "node:assert/strict";
import test from "node:test";
import {operationalSessionCanStart,mayMutateRehearsal,synchronizedShowcaseTrades,SCREEN_SHOWCASE_MAX_TRADES} from "../src/lib/drinkstock-screen-showcase.ts";
const drinks=[{id:"beer",name:"Beer"},{id:"gin",name:"Gin"},{id:"wine",name:"Wine"}];
const start=Date.parse("2026-10-19T12:00:00.000Z");
const session={id:"11111111-1111-4111-8111-111111111111",state:"running" as const,startedAt:new Date(start).toISOString(),crashUntil:null};

test("rehearsal cannot be mixed with running real operations",()=>{
 assert.equal(operationalSessionCanStart(true),false);
 assert.equal(operationalSessionCanStart(false),true);
 for(const action of ["demand","reset","resume","pause"])
  assert.equal(mayMutateRehearsal(true,action),false);
 assert.equal(mayMutateRehearsal(false,"demand"),true);
});
test("remote TV displays derive identical deterministic demo events at the same clock",()=>{
 const a=synchronizedShowcaseTrades(session,drinks,start+4500*12);
 const b=synchronizedShowcaseTrades({...session},[...drinks],start+4500*12);
 assert.deepEqual(a,b);
 assert.equal(a.length,SCREEN_SHOWCASE_MAX_TRADES);
 assert.equal(a[0]?.occurredAtMs,start+4500*12);
 assert.ok(a.every(x=>x.demoTable.startsWith("DEMO ")&&x.crash===false&&x.quantity>=1&&x.quantity<=3));
});
test("no showcase activity before a session, while paused or after it ends",()=>{
 assert.deepEqual(synchronizedShowcaseTrades(null,drinks,start+9000),[]);
 assert.deepEqual(synchronizedShowcaseTrades({...session,state:"paused"},drinks,start+9000),[]);
 assert.deepEqual(synchronizedShowcaseTrades({...session,state:"ended"},drinks,start+9000),[]);
 assert.deepEqual(synchronizedShowcaseTrades(session,[],start+9000),[]);
 assert.deepEqual(synchronizedShowcaseTrades(session,drinks,start-1000),[]);
 assert.deepEqual(synchronizedShowcaseTrades(session,drinks,NaN),[]);
});
test("60-second crash continues simulated buying every 1.7 seconds, without stop",()=>{
 const crashStart=start+45000;
 const crash={...session,state:"crashing" as const,crashUntil:new Date(crashStart+60000).toISOString()};
 const prior=synchronizedShowcaseTrades(crash,drinks,crashStart+1600);
 const tick=synchronizedShowcaseTrades(crash,drinks,crashStart+1700);
 const second=synchronizedShowcaseTrades(crash,drinks,crashStart+3400);
 assert.equal(prior.length,0);
 assert.equal(tick.length,1);
 assert.equal(second.length,2);
 assert.notEqual(tick[0].key,second[0].key);
 assert.ok(second.every(x=>x.crash));
 assert.deepEqual(synchronizedShowcaseTrades({...crash,state:"running",crashUntil:null},drinks,crashStart+60000).every(x=>!x.crash),true);
});
test("bad clocks and timestamps fail closed",()=>{
 assert.deepEqual(synchronizedShowcaseTrades({...session,startedAt:"bogus"},drinks,start+10000),[]);
 assert.deepEqual(synchronizedShowcaseTrades({...session,state:"crashing",crashUntil:"bogus"},drinks,start+10000).every(x=>!x.crash),true);
});

import assert from "node:assert/strict";
import test from "node:test";
import {synchronizedShowcasePrices,synchronizedShowcaseTrades} from "../src/lib/drinkstock-screen-showcase.ts";

const started=Date.parse("2026-10-19T11:00:00.000Z");
const drinks=[
 {id:"beer",name:"Beer",baseCents:600,priceCents:600},
 {id:"gin",name:"Gin",baseCents:1200,priceCents:1200},
 {id:"wine",name:"Wine",baseCents:900,priceCents:900}
];
const session={id:"12345678-1234-4123-8123-123456789012",state:"running" as const,
 startedAt:new Date(started).toISOString(),crashUntil:null};
function prices(now:number,opts:{state:"running"|"crashing";crashUntil:string|null}=session,
 floor=70,ceiling=145){
 return synchronizedShowcasePrices({...session,...opts},drinks,now,floor,ceiling);
}
test("TV prices are deterministic for remote displays and change on demo trades",()=>{
 const t=started+4500*15;
 const a=prices(t),b=prices(t);
 assert.deepEqual(a,b);
 assert.equal(a.length,3);
 assert.ok(a.some(p=>p.displayCents!==p.baseCents),"at least one displayed demo price moves");
 for(const p of a){
  assert.equal(p.displayCents%5,0);
  assert.ok(p.displayCents>=p.baseCents*.7);
  assert.ok(p.displayCents<=p.baseCents*1.45);
  assert.equal(p.versusBasePercent,Math.round((p.displayCents/p.baseCents-1)*100));
 }
 assert.deepEqual(prices(t),prices(t+200),"frame updates cannot drift pricing without a new trade");
 assert.ok(synchronizedShowcaseTrades(session,drinks,t).length>0);
});
test("owner-specific bounds cap every simulated price even under prolonged demand",()=>{
 for(const t of [started+4500,started+4500*18,started+4500*2000]){
  for(const p of prices(t,{state:"running",crashUntil:null},90,105)){
   assert.ok(p.displayCents>=Math.ceil(p.baseCents*.9/5)*5);
   assert.ok(p.displayCents<=Math.floor(p.baseCents*1.05/5)*5);
  }
 }
});
test("60-second crash discounts prices while simulated buying continues",()=>{
 const crashStart=started+90000;
 const crash={state:"crashing" as const,crashUntil:new Date(crashStart+60000).toISOString()};
 const justBefore=prices(crashStart-100,crash);
 const during=prices(crashStart+1700*8,crash);
 const later=prices(crashStart+1700*25,crash);
 assert.ok(justBefore.every(p=>!p.crashDiscount));
 assert.ok(during.every(p=>p.crashDiscount));
 assert.ok(later.every(p=>p.crashDiscount));
 assert.ok(during.some((p,i)=>p.displayCents<justBefore[i]!.displayCents));
 assert.ok(synchronizedShowcaseTrades({...session,...crash},drinks,crashStart+1700*25).every(t=>t.crash));
 assert.ok(during.every(p=>p.displayCents>=Math.ceil(p.baseCents*.7/5)*5));
 assert.deepEqual(prices(crashStart+60000,{state:"running",crashUntil:null}),
  prices(crashStart+60000,{state:"running",crashUntil:null}));
});
test("non-trading states, malformed timestamps and invalid owner limits fail closed",()=>{
 assert.deepEqual(synchronizedShowcasePrices(null,drinks,started+5000,70,145),[]);
 assert.deepEqual(synchronizedShowcasePrices({...session,state:"paused"},drinks,started+5000,70,145),[]);
 assert.deepEqual(synchronizedShowcasePrices({...session,state:"ended"},drinks,started+5000,70,145),[]);
 assert.deepEqual(synchronizedShowcasePrices(session,drinks,started-1,70,145),[]);
 assert.deepEqual(synchronizedShowcasePrices(session,drinks,NaN,70,145),[]);
 assert.deepEqual(synchronizedShowcasePrices(session,drinks,started+4500,40,145),[]);
 assert.deepEqual(synchronizedShowcasePrices(session,drinks,started+4500,70,220),[]);
 assert.deepEqual(synchronizedShowcasePrices({...session,startedAt:"bad"},drinks,started+4500,70,145),[]);
});
test("presentation price function does not mutate sale-authoritative input",()=>{
 const original=JSON.stringify(drinks);
 const a=prices(started+4500*22);
 assert.equal(JSON.stringify(drinks),original);
 assert.ok(a.every(p=>p.displayCents>0));
 assert.ok(drinks.every(p=>p.priceCents===p.baseCents));
});

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
  assert.ok(Number.isSafeInteger(p.displayCents));
  assert.ok(p.displayCents>=Math.ceil(p.baseCents*.7));
  assert.ok(p.displayCents<=Math.floor(p.baseCents*1.45));
  assert.equal(p.versusBasePercent,Math.round((p.displayCents/p.baseCents-1)*100));
 }
 assert.deepEqual(prices(t),prices(t+200),"frame updates cannot drift pricing without a new trade");
 assert.ok(synchronizedShowcaseTrades(session,drinks,t).length>0);
});
test("owner-specific bounds cap every simulated price even under prolonged demand",()=>{
 for(const t of [started+4500,started+4500*18,started+4500*2000]){
  for(const p of prices(t,{state:"running",crashUntil:null},90,105)){
   assert.ok(p.displayCents>=Math.ceil(p.baseCents*.9));
   assert.ok(p.displayCents<=Math.floor(p.baseCents*1.05));
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
 assert.ok(during.every(p=>p.displayCents>=Math.ceil(p.baseCents*.7)));
 assert.deepEqual(prices(crashStart+60000,{state:"running",crashUntil:null}),
  prices(crashStart+60000,{state:"running",crashUntil:null}));
});
test("TV stock prices accept odd-cent quotes and follow relative order volume",()=>{
 const products=[
  {id:"a",name:"A",baseCents:601,priceCents:601},
  {id:"b",name:"B",baseCents:711,priceCents:711},
  {id:"c",name:"C",baseCents:903,priceCents:903}
 ];
 const scans=Array.from({length:40},(_,i)=>
  synchronizedShowcasePrices(session,products,started+4500*(i+1),70,145));
 assert.ok(scans.flat().some(p=>p.displayCents%5!==0),
  "quotes must not snap to a multiple of five cents");
 for(const batch of scans)for(const p of batch){
  assert.ok(Number.isSafeInteger(p.displayCents));
  assert.ok(p.displayCents>=Math.ceil(p.baseCents*.7));
  assert.ok(p.displayCents<=Math.floor(p.baseCents*1.45));
 }
 const atTrade=started+4500*24;
 assert.deepEqual(
  synchronizedShowcasePrices(session,products,atTrade,70,145),
  synchronizedShowcasePrices(session,products,atTrade+100,70,145),
  "no random drift between simulated executions");
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

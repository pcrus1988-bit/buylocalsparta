import assert from "node:assert/strict";
import test from "node:test";
import {drinkPriceBand,centsFromEuros,priceRehearsalDemand,validateMarketAction,validateNewDrink,validateMarketBounds,venueCanManageMarket,mayEditPreSessionConfig} from "../src/lib/drinkstock-market-pricing.ts";
const a={id:"a",name:"Draft Beer",baseCents:500,priceCents:500};
const b={id:"b",name:"Mojito",baseCents:900,priceCents:900};
const key="f71b6509-469f-4dea-85df-b4d05371b9fa";
test("deterministic market tick increases selected, decreases others with owner limits and single-cent precision",()=>{
  const m=priceRehearsalDemand([a,b],"a");assert.deepEqual(m.map(x=>x.afterCents),[509,895]);
  assert.equal(m[0].demandUnits,1);
  assert.notEqual(m[0].afterCents%5,0,"price steps are not restricted to nickels");
  let prices=[a,b];
  for(let i=0;i<75;i++)prices=priceRehearsalDemand(prices,"a").map((p,j)=>({...prices[j],priceCents:p.afterCents}));
  assert.equal(prices[0].priceCents,725);assert.equal(prices[1].priceCents,630);
});
test("price caps follow the base price and never become negative",()=>{
  assert.deepEqual(drinkPriceBand(500),{minCents:350,maxCents:725});
  assert.throws(()=>drinkPriceBand(0));
  assert.deepEqual(drinkPriceBand(101),{minCents:71,maxCents:146});
  assert.equal(centsFromEuros(4.55),455);
  for(const x of [NaN,0,4.555,"9.99",Infinity])assert.throws(()=>centsFromEuros(x));
});
test("rejects unknown selection and market state corruption",()=>{
  assert.throws(()=>priceRehearsalDemand([a],"unknown"));
  assert.throws(()=>priceRehearsalDemand([{...a,priceCents:4000}],"a"));
});
test("validates products and actions, no client-selected partner or role",()=>{
  assert.deepEqual(validateNewDrink({name:"  Draft   Beer ",category:"beer",basePriceEuros:5}),
    {name:"Draft Beer",category:"beer",baseCents:500});
  assert.equal(validateMarketAction({action:"demand",requestKey:key,productId:"f71b6509-469f-4dea-85df-b4d05371b9fa"}).action,"demand");
  for(const v of [{action:"demand",requestKey:key,productId:"not-uuid"},{action:"resume",requestKey:"bogus"},{action:"sell",requestKey:key}])
    assert.throws(()=>validateMarketAction(v));
  assert.equal(venueCanManageMarket("owner"),true);assert.equal(venueCanManageMarket("manager"),true);
  assert.equal(venueCanManageMarket("staff"),false);assert.equal(venueCanManageMarket("viewer"),false);
});

test("owner/manager may set venue-specific lower and upper bounds before starting",()=>{
  assert.deepEqual(validateMarketBounds({floorPercent:60,ceilingPercent:170}),{floorPercent:60,ceilingPercent:170});
  assert.deepEqual(drinkPriceBand(500,{floorPercent:60,ceilingPercent:170}),{minCents:300,maxCents:850});
  assert.deepEqual(drinkPriceBand(900,{floorPercent:50,ceilingPercent:200}),{minCents:450,maxCents:1800});
  const signal=priceRehearsalDemand([{...a,priceCents:350},b],"a",{floorPercent:50,ceilingPercent:200});
  assert.equal(signal[0].afterCents,356);
  const set=validateMarketAction({action:"set_bounds",requestKey:key,bounds:{floorPercent:55,ceilingPercent:190}});
  assert.deepEqual(set.bounds,{floorPercent:55,ceilingPercent:190});
  const blockBuy=priceRehearsalDemand([a,b],"a",undefined,3);
  assert.deepEqual(blockBuy.map(m=>m.afterCents),[514,892]);
  assert.equal(blockBuy[0].demandUnits,3);
  assert.ok(blockBuy[0].afterCents>signal[0].afterCents);
  assert.equal(validateMarketAction({action:"demand",requestKey:key,productId:"f71b6509-469f-4dea-85df-b4d05371b9fa",units:5}).units,5);
});
test("invalid demand volume is rejected and price quotes stay integer cents",()=>{
 for(const units of [-1,0,1.2,11,100,"3",null,NaN]){
  assert.throws(()=>priceRehearsalDemand([a,b],"a",undefined,units as number));
  assert.throws(()=>validateMarketAction({
   action:"demand",requestKey:key,productId:"f71b6509-469f-4dea-85df-b4d05371b9fa",units
  }));
 }
 const c={...a,baseCents:101,priceCents:101};
 const d={...b,baseCents:199,priceCents:199};
 const moves=priceRehearsalDemand([c,d],"a");
 assert.ok(moves.every(p=>Number.isSafeInteger(p.afterCents)&&p.afterCents>0));
 assert.ok(moves[0].afterCents>101&&moves[1].afterCents<199);
});
test("operational sessions freeze bounds and catalogue even with rehearsal paused",()=>{
 assert.equal(mayEditPreSessionConfig({rehearsalEnabled:false,activeSession:false}),true);
 assert.equal(mayEditPreSessionConfig({rehearsalEnabled:true,activeSession:false}),false);
 assert.equal(mayEditPreSessionConfig({rehearsalEnabled:false,activeSession:true}),false);
 assert.equal(mayEditPreSessionConfig({rehearsalEnabled:true,activeSession:true}),false);
});
test("invalid bounds, non-integer percentages, and fabricated actions are rejected",()=>{
  for(const bounds of [
    {floorPercent:49,ceilingPercent:145},
    {floorPercent:70,ceilingPercent:201},
    {floorPercent:101,ceilingPercent:145},
    {floorPercent:70.5,ceilingPercent:145},
    {floorPercent:"70",ceilingPercent:145},
    {floorPercent:70,ceilingPercent:99},
    null
  ]){
    assert.throws(()=>validateMarketBounds(bounds));
    assert.throws(()=>validateMarketAction({action:"set_bounds",requestKey:key,bounds}));
  }
});

 test("custom drinks accept explicit VAT classification without implying merchant sign-off",()=>{
  for(const vatClass of ["alcoholic","non_alcoholic","water","review_required"]){
   assert.equal(validateNewDrink({name:"House drink",category:"cocktail",basePriceEuros:5,vatClass}).vatClass,vatClass);
  }
  assert.equal(validateNewDrink({name:"Mocktail",category:"cocktail",basePriceEuros:5,vatClass:"non_alcoholic"}).vatClass,"non_alcoholic");
  for(const vatClass of ["24%","beer",true,{},null,["water"]]){
   assert.throws(()=>validateNewDrink({name:"House drink",category:"beer",basePriceEuros:5,vatClass}),/INVALID_VAT_CLASS/);
  }
 });

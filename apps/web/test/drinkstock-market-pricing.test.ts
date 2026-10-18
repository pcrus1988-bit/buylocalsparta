import assert from "node:assert/strict";
import test from "node:test";
import {drinkPriceBand,centsFromEuros,priceRehearsalDemand,validateMarketAction,validateNewDrink,venueCanManageMarket} from "../src/lib/drinkstock-market-pricing.ts";
const a={id:"a",name:"Draft Beer",baseCents:500,priceCents:500};
const b={id:"b",name:"Mojito",baseCents:900,priceCents:900};
const key="f71b6509-469f-4dea-85df-b4d05371b9fa";
test("deterministic market tick increases selected, decreases others with bound and 5-cent rounding",()=>{
  const m=priceRehearsalDemand([a,b],"a");assert.deepEqual(m.map(x=>x.afterCents),[535,885]);
  let prices=[a,b];
  for(let i=0;i<75;i++)prices=priceRehearsalDemand(prices,"a").map((p,j)=>({...prices[j],priceCents:p.afterCents}));
  assert.equal(prices[0].priceCents,725);assert.equal(prices[1].priceCents,630);
});
test("price caps follow the base price and never become negative",()=>{
  assert.deepEqual(drinkPriceBand(500),{minCents:350,maxCents:725});
  assert.throws(()=>drinkPriceBand(0));
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

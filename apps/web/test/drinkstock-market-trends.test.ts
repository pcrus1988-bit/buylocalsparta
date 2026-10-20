import assert from "node:assert/strict";
import test from "node:test";
import {recordedRehearsalPriceSeries,priceSparklinePoints} from "../src/lib/drinkstock-market-trends.ts";
import {synchronizedShowcasePriceHistory,synchronizedShowcasePrices} from "../src/lib/drinkstock-screen-showcase.ts";

const event=(id:string,createdAt:string,movements:{id:string;beforeCents:number;afterCents:number}[])=>({id,createdAt,movements});
const started=Date.parse("2026-10-20T08:00:00.000Z");
const session={id:"12345678-1234-4123-8123-123456789012",state:"running" as const,
 startedAt:new Date(started).toISOString(),crashUntil:null};
const products=[
 {id:"beer",name:"Beer",baseCents:601,priceCents:601},
 {id:"cola",name:"Cola",baseCents:403,priceCents:403},
 {id:"wine",name:"Wine",baseCents:900,priceCents:900}
];
test("recorded venue histories follow persisted rehearsal movements only",()=>{
 const events=[
  event("2","2026-10-20T08:01:00Z",[{id:"beer",beforeCents:611,afterCents:623},{id:"cola",beforeCents:398,afterCents:390}]),
  event("1","2026-10-20T08:00:00Z",[{id:"beer",beforeCents:601,afterCents:611},{id:"cola",beforeCents:403,afterCents:398}])
 ];
 const original=JSON.stringify(events);
 assert.deepEqual(recordedRehearsalPriceSeries(events,"beer",623),[601,611,623]);
 assert.deepEqual(recordedRehearsalPriceSeries(events,"cola",390),[403,398,390]);
 assert.deepEqual(recordedRehearsalPriceSeries(events,"wine",900),[900]);
 assert.equal(JSON.stringify(events),original,"source audit events must not be reordered");
});
test("invalid, disconnected or stale rehearsal evidence must not create a chart",()=>{
 const e=[
  event("1","2026-10-20T08:00:00Z",[{id:"beer",beforeCents:601,afterCents:611}]),
  event("2","2026-10-20T08:01:00Z",[{id:"beer",beforeCents:999,afterCents:1000}])
 ];
 assert.deepEqual(recordedRehearsalPriceSeries(e,"beer",1000),[999,1000]);
 assert.deepEqual(recordedRehearsalPriceSeries(e,"beer",900),[900]);
 assert.deepEqual(recordedRehearsalPriceSeries(e,"beer",NaN),[]);
 assert.deepEqual(recordedRehearsalPriceSeries(e,"unknown",50),[50]);
 assert.equal(priceSparklinePoints([900]),"");
 assert.equal(priceSparklinePoints([900,NaN]),"");
});
test("sparkline geometry remains inside viewbox and flat quotes are centered",()=>{
 const pts=priceSparklinePoints([301,300,304,302]).split(" ");
 assert.equal(pts.length,4);
 for(const p of pts){
  const [x,y]=p.split(",").map(Number);
  assert.ok(x>=4&&x<=156&&y>=4&&y<=40);
 }
 assert.equal(priceSparklinePoints([508,508]),"4.00,22.00 156.00,22.00");
});
test("remote TVs calculate identical latest 12 executed demo-price ticks",()=>{
 const now=started+4500*44;
 const a=synchronizedShowcasePriceHistory(session,products,now,70,145);
 const b=synchronizedShowcasePriceHistory(session,products,now+150,70,145);
 assert.deepEqual(a,b);
 assert.equal(a.length,products.length);
 for(const series of a){
  assert.equal(series.prices.length,12);
  assert.ok(series.prices.every(x=>Number.isSafeInteger(x)&&x>0));
  const current=synchronizedShowcasePrices(session,products,now,70,145).find(x=>x.productId===series.productId)!;
  assert.equal(series.prices.at(-1),current.displayCents);
 }
 assert.ok(a.some(p=>priceSparklinePoints(p.prices)!==""));
 assert.ok(a.flatMap(x=>x.prices).some(x=>x%5!==0));
});
test("crash chart begins a separate trading phase and continues buying",()=>{
 const crashStart=started+90000;
 const crash={...session,state:"crashing" as const,crashUntil:new Date(crashStart+60000).toISOString()};
 const beginning=synchronizedShowcasePriceHistory(crash,products,crashStart,70,145);
 const during=synchronizedShowcasePriceHistory(crash,products,crashStart+1700*8,70,145);
 assert.ok(beginning.every(x=>x.prices.length===1));
 assert.ok(during.every(x=>x.prices.length===9));
 assert.ok(during.some(x=>new Set(x.prices).size>1),"trade ticks move the market during crash");
 assert.ok(during.every(x=>x.prices.every((c)=>c>=Math.ceil(products.find(p=>p.id===x.productId)!.baseCents*.7))));
 assert.deepEqual(synchronizedShowcasePriceHistory({...session,state:"paused"},products,started+9000,70,145),[]);
 assert.deepEqual(synchronizedShowcasePriceHistory(session,products,started+9000,10,145),[]);
 assert.deepEqual(synchronizedShowcasePriceHistory(null,products,started+9000,70,145),[]);
});

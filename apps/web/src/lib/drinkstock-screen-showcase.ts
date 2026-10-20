/** A shared-clock presentation tape for venue TVs. Entirely simulated:
 * it NEVER writes to market prices, payments, customer orders or receipts.
 */
export type ShowcaseSession=Readonly<{
 id:string;state:"scheduled"|"running"|"paused"|"crashing"|"ended";
 startedAt:string|null;crashUntil:string|null;
}>;
export type ShowcaseDrink=Readonly<{id:string;name:string}>;
export type ShowcaseTrade=Readonly<{
 key:string;productId:string;productName:string;quantity:number;
 demoTable:string;occurredAtMs:number;crash:boolean;
}>;
const REGULAR_CADENCE_MS=4500;
const CRASH_CADENCE_MS=1700;
const CRASH_DURATION_MS=60000;
export const SCREEN_SHOWCASE_MAX_TRADES=8;
function hashKey(key:string){
 let hash=2166136261;
 for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);
 return hash>>>0;
}
export function operationalSessionCanStart(rehearsalEnabled:boolean):boolean{return !rehearsalEnabled;}
export function mayMutateRehearsal(activeSession:boolean,action:string):boolean{
 return !activeSession||action==="add_product"||action==="set_bounds";
}
/** Deterministic at the same session, phase and clock across remote displays.
 * Never uses the venue's actual table labels. Do not feed these into pricing. */
function showcaseTradesAt(
 session:ShowcaseSession|null,
 products:readonly ShowcaseDrink[],
 nowMs:number,maxTrades:number
):ShowcaseTrade[]{
 if(!session||!["running","crashing"].includes(session.state)||products.length===0||
    !Number.isFinite(nowMs)||nowMs<0||!session.startedAt)return [];
 const sessionStart=Date.parse(session.startedAt);
 if(!Number.isFinite(sessionStart)||nowMs<sessionStart)return [];
 const isCrash=session.state==="crashing"&&Boolean(session.crashUntil);
 const crashEnd=isCrash?Date.parse(session.crashUntil!):NaN;
 const crashStart=crashEnd-CRASH_DURATION_MS;
 const crashActive=isCrash&&Number.isFinite(crashEnd)&&
  crashStart>=sessionStart&&nowMs>=crashStart&&nowMs<crashEnd;
 const phaseStart=crashActive?crashStart:sessionStart;
 const interval=crashActive?CRASH_CADENCE_MS:REGULAR_CADENCE_MS;
 const phase=crashActive?"crash":"regular";
 const step=Math.floor((nowMs-phaseStart)/interval);
 // At the first tick there is no previous trade. Keep a hard maximum of 8 rows.
 if(step<1)return [];
 const seed=hashKey(session.id+":"+phase);
 const count=Math.min(maxTrades,step);
 const result:ShowcaseTrade[]=[];
 for(let i=0;i<count;i++){
  const tick=step-i;
  const product=products[(seed+tick*7+Math.floor(tick/3))%products.length]!;
  const quantity=1+(hashKey(session.id+":"+phase+":"+tick)%3);
  const tableNum=(hashKey(session.id+":table:"+tick)%12)+1;
  result.push({
   key:session.id+":"+phase+":"+tick,
   productId:product.id,productName:product.name,quantity,
   demoTable:"DEMO "+String(tableNum).padStart(2,"0"),
   occurredAtMs:phaseStart+tick*interval,crash:crashActive
  });
 }
 return result;
}
/** The last eight visible trades; pricing is based on a deeper time-weighted tape. */
export function synchronizedShowcaseTrades(
 session:ShowcaseSession|null,products:readonly ShowcaseDrink[],nowMs:number
):ShowcaseTrade[]{
 return showcaseTradesAt(session,products,nowMs,SCREEN_SHOWCASE_MAX_TRADES);
}

/** Presentation-only simulated prices. Values are never charged, persisted,
 * written to orders, or used by public table/cart price previews.
 * The shared session clock produces identical prices on all remote screens.
 */
export type ShowcasePricedDrink=ShowcaseDrink&Readonly<{baseCents:number;priceCents:number}>;
export type ShowcasePrice=Readonly<{
 productId:string;displayCents:number;baseCents:number;
 movementCents:number;versusBasePercent:number;crashDiscount:boolean;
}>;
function demoPriceBand(base:number,floorPercent:number,ceilingPercent:number){
 return {floor:Math.ceil(base*floorPercent/100),
  ceiling:Math.floor(base*ceilingPercent/100)};
}
/**
 * Stock-style demo quotes: recent buy volume bids up popular drinks; weak
 * relative buying depresses the rest. Every cent is an allowed tick.
 * Quotes are recalculated from the same bounded 48-trade tape on each TV;
 * there is no random animation drift and no financial ledger mutation.
 */
function demoPriceAt(
 session:ShowcaseSession,products:readonly ShowcasePricedDrink[],
 timestamp:number,floorPercent:number,ceilingPercent:number,
 product:ShowcasePricedDrink
):number{
 const start=Date.parse(session.startedAt??"");
 if(!Number.isFinite(start)||timestamp<start)return product.priceCents;
 const crashEnd=session.state==="crashing"&&session.crashUntil?Date.parse(session.crashUntil):NaN;
 const crashStart=crashEnd-CRASH_DURATION_MS;
 const inCrash=Number.isFinite(crashEnd)&&crashStart>=start&&timestamp>=crashStart&&timestamp<crashEnd;
 const source=inCrash?session:{...session,state:"running" as const,crashUntil:null};
 const tape=showcaseTradesAt(source,products,timestamp,48);
 let owned=0,total=0;
 for(let i=0;i<tape.length;i++){
  const trade=tape[i]!;
  const volume=trade.quantity*Math.pow(0.90,i);
  total+=volume;
  if(trade.productId===product.id)owned+=volume;
 }
 let pressure=0;
 if(products.length===1){
  // Without competing symbols a buy is still an upward demand signal.
  pressure=Math.min(.20,owned*.012);
 }else if(total>0){
  // Average volume per symbol is the neutral point. A low-demand drink
  // declines even when all trades are buys (they are buying its peers).
  const expected=total/products.length;
  const imbalance=(owned-expected)/Math.max(5,expected);
  pressure=Math.max(-.20,Math.min(.28,imbalance*.19));
 }
 // A crash is an extraordinary downward market shock, not a trading halt.
 // Quantize the pressure to buy ticks so frames stay identical between trades.
 const crashTick=inCrash?Math.floor((timestamp-crashStart)/CRASH_CADENCE_MS):0;
 const crashProgress=Math.min(1,crashTick*CRASH_CADENCE_MS/CRASH_DURATION_MS);
 const crashPressure=inCrash?-(.10+.12*crashProgress):0;
 const price=Math.round(product.baseCents*(1+pressure+crashPressure));
 const band=demoPriceBand(product.baseCents,floorPercent,ceilingPercent);
 return Math.max(band.floor,Math.min(band.ceiling,price));
}

export function synchronizedShowcasePrices(
 session:ShowcaseSession|null,products:readonly ShowcasePricedDrink[],
 nowMs:number,floorPercent:number,ceilingPercent:number
):ShowcasePrice[]{
 const validBounds=Number.isInteger(floorPercent)&&floorPercent>=50&&floorPercent<=100&&
 Number.isInteger(ceilingPercent)&&ceilingPercent>=100&&ceilingPercent<=200;
 if(!validBounds||!Number.isFinite(nowMs)||!session||!session.startedAt||
    !["running","crashing"].includes(session.state)||products.length>60)return [];
 const start=Date.parse(session.startedAt);
 if(!Number.isFinite(start)||nowMs<start)return [];
 const crashEnd=session.state==="crashing"&&session.crashUntil?Date.parse(session.crashUntil):NaN;
 const crashStart=crashEnd-CRASH_DURATION_MS;
 const crashActive=Number.isFinite(crashEnd)&&crashStart>=start&&nowMs>=crashStart&&nowMs<crashEnd;
 const previous=nowMs-(crashActive?CRASH_CADENCE_MS:REGULAR_CADENCE_MS);
 return products.map(product=>{
  if(!Number.isSafeInteger(product.baseCents)||product.baseCents<100||product.baseCents>200000||
   !Number.isSafeInteger(product.priceCents)||product.priceCents<0)
   return {productId:product.id,displayCents:product.priceCents,baseCents:product.priceCents,
    movementCents:0,versusBasePercent:0,crashDiscount:false};
  const displayCents=demoPriceAt(session,products,nowMs,floorPercent,ceilingPercent,product);
  const lastCents=previous>=start?
   demoPriceAt(session,products,previous,floorPercent,ceilingPercent,product):product.baseCents;
  return {productId:product.id,displayCents,baseCents:product.baseCents,
   movementCents:displayCents-lastCents,
   versusBasePercent:Math.round((displayCents/product.baseCents-1)*100),
   crashDiscount:crashActive};
 });
}

/**
 * Last 12 executed demo-tick quotes, not a browser-side random graph.
 * A crash starts a new 1.7s phase; no inaccessible historical session or
 * payment records are reconstructed. All venue TVs get identical points.
 */
export type ShowcasePriceSeries=Readonly<{productId:string;prices:readonly number[]}>;
export function synchronizedShowcasePriceHistory(
 session:ShowcaseSession|null,products:readonly ShowcasePricedDrink[],
 nowMs:number,floorPercent:number,ceilingPercent:number
):ShowcasePriceSeries[]{
 if(!session||!session.startedAt||!Number.isFinite(nowMs)||products.length===0)return [];
 const start=Date.parse(session.startedAt);
 if(!Number.isFinite(start)||nowMs<start)return [];
 const crashEnd=session.state==="crashing"&&session.crashUntil?Date.parse(session.crashUntil):NaN;
 const crashStart=crashEnd-CRASH_DURATION_MS;
 const isCrash=Number.isFinite(crashEnd)&&crashStart>=start&&nowMs>=crashStart&&nowMs<crashEnd;
 const phaseStart=isCrash?crashStart:start;
 const cadence=isCrash?CRASH_CADENCE_MS:REGULAR_CADENCE_MS;
 const tick=Math.floor((nowMs-phaseStart)/cadence);
 if(tick<0)return [];
 const count=Math.min(12,tick+1);
 const byId=new Map<string,number[]>();
 for(let i=tick-count+1;i<=tick;i++){
  const frame=phaseStart+i*cadence;
  const quotes=synchronizedShowcasePrices(session,products,frame,floorPercent,ceilingPercent);
  if(quotes.length!==products.length)return [];
  for(const quote of quotes){
   if(!Number.isSafeInteger(quote.displayCents)||quote.displayCents<1)return [];
   const points=byId.get(quote.productId)??[];
   points.push(quote.displayCents);
   byId.set(quote.productId,points);
  }
 }
 return products.map(p=>({productId:p.id,prices:byId.get(p.id)??[]}));
}

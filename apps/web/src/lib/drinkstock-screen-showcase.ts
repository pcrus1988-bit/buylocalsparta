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
export function synchronizedShowcaseTrades(
 session:ShowcaseSession|null,
 products:readonly ShowcaseDrink[],
 nowMs:number
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
 const count=Math.min(SCREEN_SHOWCASE_MAX_TRADES,step);
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
 return {floor:Math.ceil(base*floorPercent/100/5)*5,
 ceiling:Math.floor(base*ceilingPercent/100/5)*5};
}
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
 const tick=Math.floor((timestamp-(inCrash?crashStart:start))/(inCrash?CRASH_CADENCE_MS:REGULAR_CADENCE_MS));
 const signals=synchronizedShowcaseTrades(
 inCrash?session:{...session,state:"running",crashUntil:null},
 products,timestamp);
 // Weight only the most recent eight signals. Session age cannot lead to
 // unbounded execution or unbounded inflation.
 let demand=0;
 for(const trade of signals){
  demand+=trade.productId===product.id?trade.quantity*0.033:-trade.quantity*0.013;
 }
 // Deterministic market movement only at a simulated trade tick, not every
 // animation frame. Each product has its own phase (different price curves).
 const pulse=Math.sin(tick*0.88+(hashKey(session.id+":"+product.id)%100)/14)*0.013;
 const crashPressure=inCrash?-(0.11+0.11*Math.min(1,(timestamp-crashStart)/CRASH_DURATION_MS)):0;
 const price=Math.round(product.baseCents*(1+demand+pulse+crashPressure)/5)*5;
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

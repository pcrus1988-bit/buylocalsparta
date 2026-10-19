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

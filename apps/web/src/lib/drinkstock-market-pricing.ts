/** Deterministic, single-cent demand pricing for rehearsal. Never a POS/checkout authority. */
export type RehearsalDrink = Readonly<{id:string;name:string;baseCents:number;priceCents:number}>;
export type RehearsalMovement = Readonly<{id:string;name:string;beforeCents:number;afterCents:number;deltaCents:number;demandUnits?:number}>;
export const VENUE_MAX_PRODUCTS = 60;
export const DEFAULT_PRICE_BOUNDS = Object.freeze({floorPercent:70,ceilingPercent:145});
export type MarketBounds=Readonly<{floorPercent:number;ceilingPercent:number}>;
/** Both an operational session and a rehearsal lock the saved venue price band. */
export function mayEditPreSessionConfig({rehearsalEnabled,activeSession}:Readonly<{rehearsalEnabled:boolean;activeSession:boolean}>){
 return !rehearsalEnabled&&!activeSession;
}
export function validateMarketBounds(value:unknown):MarketBounds{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("INVALID_PRICE_BOUNDS");
 const b=value as Record<string,unknown>;
 if(!Number.isInteger(b.floorPercent)||!Number.isInteger(b.ceilingPercent)||
    (b.floorPercent as number)<50||(b.floorPercent as number)>100||
    (b.ceilingPercent as number)<100||(b.ceilingPercent as number)>200)
    throw new Error("INVALID_PRICE_BOUNDS");
 return {floorPercent:b.floorPercent as number,ceilingPercent:b.ceilingPercent as number};
}
export const DRINKSTOCK_CATEGORIES = ["beer","cocktail","spirits","wine","soft_drink","other"] as const;
export type DrinkStockCategory = typeof DRINKSTOCK_CATEGORIES[number];

export function drinkPriceBand(baseCents:number,bounds:MarketBounds=DEFAULT_PRICE_BOUNDS):Readonly<{minCents:number;maxCents:number}> {
  if(!Number.isInteger(baseCents)||baseCents<100||baseCents>200000)throw new Error("INVALID_BASE_PRICE");
  const valid=validateMarketBounds(bounds);
  return {minCents:Math.ceil(baseCents*valid.floorPercent/100),
          maxCents:Math.floor(baseCents*valid.ceilingPercent/100)};
}
export function centsFromEuros(value:unknown):number {
  if(typeof value!=="number"||!Number.isFinite(value)||value<1||value>2000||
     Math.abs(value*100-Math.round(value*100))>0.000001)throw new Error("INVALID_BASE_PRICE");
  return Math.round(value*100);
}
export function validateNewDrink(value:unknown):Readonly<{name:string;category:DrinkStockCategory;baseCents:number}> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("INVALID_PRODUCT");
  const v=value as Record<string,unknown>;
  const name=typeof v.name==="string"?v.name.trim().replace(/\s+/g," "):"";
  if(name.length<2||name.length>80)throw new Error("INVALID_PRODUCT_NAME");
  if(typeof v.category!=="string" || !DRINKSTOCK_CATEGORIES.some(c=>c===v.category))
    throw new Error("INVALID_CATEGORY");
  return {name,category:v.category as DrinkStockCategory,baseCents:centsFromEuros(v.basePriceEuros)};
}
/**
 * A buy increases its drink's quote, while drinks not bought lose relative
 * demand. Volume amplifies pressure without changing a price by a fixed
 * nickel/dime tick. Each integer cent is a valid quote. Owner limits win.
 *
 * This is a *manual rehearsal demand signal*, not a captured customer order.
 */
export function priceRehearsalDemand(
 drinks:readonly RehearsalDrink[],selectedId:string,
 bounds:MarketBounds=DEFAULT_PRICE_BOUNDS,units=1
):RehearsalMovement[]{
 if(!Number.isInteger(units)||units<1||units>10)throw new Error("INVALID_DEMAND_UNITS");
 if(!drinks.length||drinks.length>VENUE_MAX_PRODUCTS||!drinks.some(d=>d.id===selectedId))
  throw new Error("DRINK_NOT_IN_VENUE");
 // Smaller buys move prices less than block-sized orders. Unbought listings
 // ease as liquidity flows toward the popular product.
 const buyImpact=0.012+Math.min(0.028,units*0.005);
 const absenceImpact=0.004+Math.min(0.016,units*0.0015);
 return drinks.map(d=>{
  const band=drinkPriceBand(d.baseCents,bounds);
  if(!Number.isSafeInteger(d.priceCents)||d.priceCents<band.minCents||d.priceCents>band.maxCents)
   throw new Error("INVALID_MARKET_STATE");
  const bought=d.id===selectedId;
  const candidate=Math.round(d.priceCents*(bought?1+buyImpact:1-absenceImpact));
  const afterCents=Math.max(band.minCents,Math.min(band.maxCents,candidate));
  return {id:d.id,name:d.name,beforeCents:d.priceCents,afterCents,
   deltaCents:afterCents-d.priceCents,...(bought?{demandUnits:units}:{})};
 });
}

export function validateMarketAction(input:unknown):{
  action:"add_product"|"demand"|"reset"|"pause"|"resume"|"set_bounds"; requestKey:string;
  productId?:string; product?:ReturnType<typeof validateNewDrink>;bounds?:MarketBounds;units?:number
} {
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("INVALID_REQUEST");
  const v=input as Record<string,unknown>;
  const action=v.action;
  if(action!=="add_product"&&action!=="demand"&&action!=="reset"&&action!=="pause"&&action!=="resume"&&action!=="set_bounds")
    throw new Error("INVALID_ACTION");
  const requestKey=typeof v.requestKey==="string"?v.requestKey:"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey))
    throw new Error("INVALID_REQUEST_KEY");
  if(action==="add_product")return {action,requestKey,product:validateNewDrink(v.product)};
  if(action==="set_bounds")return {action,requestKey,bounds:validateMarketBounds(v.bounds)};
  if(action==="demand"){
    if(typeof v.productId!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(v.productId))
      throw new Error("INVALID_PRODUCT_ID");
    const units=v.units===undefined?1:v.units;
    if(!Number.isInteger(units)||Number(units)<1||Number(units)>10)
      throw new Error("INVALID_DEMAND_UNITS");
    return {action,requestKey,productId:v.productId,units:Number(units)};
  }
  return {action,requestKey};
}
export function venueCanManageMarket(role:string):boolean{return role==="owner"||role==="manager";}

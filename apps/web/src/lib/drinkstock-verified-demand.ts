/**
 * Read-only market pressure derived from provider-evidenced paid order volume.
 * This is a commercial-pricing *preview*, not a payment adapter or a quote.
 * Never use a browser's claimed quantity/paid status as order evidence.
 */
export type EvidencedDemandProduct=Readonly<{
 id:string;venueId:string;name:string;
 priceCents:number;minCents:number;maxCents:number;verifiedUnits:number;
}>;
export type DemandPressure=Readonly<{
 productId:string;name:string;verifiedUnits:number;weightPercent:number;
 currentCents:number;indicativeCents:number;movementCents:number;
 pressureBasisPoints:number;direction:"rising"|"falling"|"stable";
}>;
export type VenueDemandPreview=Readonly<{
 venueId:string;verifiedUnits:number;productsWithVerifiedSales:number;
 previewOnly:true;pricingApplied:false;
 products:readonly DemandPressure[];
}>;
function integer(v:number){return Number.isSafeInteger(v);}
function validProduct(d:EvidencedDemandProduct){
 return d.id.length>0&&d.venueId.length>0&&d.name.length>0&&
 integer(d.priceCents)&&integer(d.minCents)&&integer(d.maxCents)&&
 integer(d.verifiedUnits)&&d.verifiedUnits>=0&&d.verifiedUnits<=100000000&&
 d.minCents>=1&&d.priceCents>=d.minCents&&d.priceCents<=d.maxCents&&
 d.maxCents<=400000;
}
/**
 * Every venue competes only against its own listed products.
 * Relative demand is compared with an equal-share baseline. A product
 * receiving more buys than the baseline gains indicative pricing pressure;
 * products with few/no buys lose pressure. No orders => no movements.
 *
 * Hard limits: -75 to +150 basis points per *hypothetical* evaluation and
 * each product's persisted floor/ceiling. This function makes no writes.
 */
export function verifiedDemandPricePreview(
 venueId:string,products:readonly EvidencedDemandProduct[]
):VenueDemandPreview{
 if(!venueId||products.length>60||products.some(p=>p.venueId!==venueId||!validProduct(p)))
  throw new Error("INVALID_VERIFIED_DEMAND_INPUT");
 if(new Set(products.map(p=>p.id)).size!==products.length)
  throw new Error("DUPLICATE_DEMAND_PRODUCT");
 const total=products.reduce((sum,p)=>sum+p.verifiedUnits,0);
 if(!integer(total))throw new Error("INVALID_VERIFIED_DEMAND_TOTAL");
 const expected=products.length?total/products.length:0;
 const priced=products.map(p=>{
  const relative=total>0?(p.verifiedUnits-expected)/Math.max(1,expected):0;
  const pressureBasisPoints=total===0?0:
   Math.max(-75,Math.min(150,Math.round(relative*70)));
  const candidate=Math.round(p.priceCents*(10000+pressureBasisPoints)/10000);
  const indicativeCents=Math.min(p.maxCents,Math.max(p.minCents,candidate));
  const movementCents=indicativeCents-p.priceCents;
  return {productId:p.id,name:p.name,verifiedUnits:p.verifiedUnits,
   weightPercent:total?Math.round(p.verifiedUnits/total*1000)/10:0,
   currentCents:p.priceCents,indicativeCents,movementCents,pressureBasisPoints,
   direction:movementCents>0?"rising" as const:movementCents<0?"falling" as const:"stable" as const};
 });
 return {venueId,verifiedUnits:total,
  productsWithVerifiedSales:products.filter(p=>p.verifiedUnits>0).length,
  previewOnly:true,pricingApplied:false,products:priced};
}

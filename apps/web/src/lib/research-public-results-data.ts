import type { PublishedResearchEstimate } from "./research-survey-release";
import { GREECE_REGIONS } from "./research-geographic-core.ts";
import { PUBLIC_RESULTS_METRICS } from "./research-public-results-sections.ts";

/** Minimal release-derived browser payload. Never ship raw survey answers or
 * suppressed/low-n estimates. One dimension per estimate (no false cross-filter).
 */
export type SafePublicResultPoint = Readonly<{
 metricKey:string; label:string; value:number; format:"proportion"|"mean";
 segment: Readonly<Record<string,string>>; n:number;
 ciLower:number|null; ciUpper:number|null;
}>;
export type SafeParticipationGeography = Readonly<{
 regions: readonly Readonly<{key:string;label:string;started:number}>[];
 densityImage?:string;
}>;
const RESTRICTED = /exp01|experiment|randomized_profile|platform_choice|conjoint|amce/i;
const METRIC_SET=new Set(PUBLIC_RESULTS_METRICS);
const permittedRegion=new Set<string>(GREECE_REGIONS.map(r=>r.key));
export function publicResultPoints(estimates: readonly PublishedResearchEstimate[]): SafePublicResultPoint[]{
 return estimates.flatMap(e=>{
  if(e.suppressed || e.estimate===null || !Number.isFinite(e.estimate) ||
    !Number.isSafeInteger(e.unweightedN)||e.unweightedN<30 ||
    !METRIC_SET.has(e.metricKey) || RESTRICTED.test(e.metricKey) || RESTRICTED.test(e.method) ||
    RESTRICTED.test(String(e.metadata.experimentCode??""))) return [];
  const entries=Object.entries(e.segment);
  // Bivariate cells are NEVER reconstructed from marginal figures.
  // A publication reviewer must explicitly approve each sufficiently large cross-tab.
  const isCross=entries.length===2&&entries.every(([key])=>["regionCode","sectorCode"].includes(key))&&
   entries.some(([key])=>key==="regionCode")&&entries.some(([key])=>key==="sectorCode");
  if(entries.length>2 || entries.some(([key])=>!["regionCode","sectorCode","sizeBand"].includes(key)) ||
     (entries.length===2&&!isCross) ||
     (isCross&&(e.unweightedN<50||e.metadata.publicCrossTabApproved!==true)))return [];
  if(entries.some(([_,value])=>typeof value!=="string"||!value.trim()))return [];
  // regionCode in the current frozen frame is a HISTORICAL prefecture code.
  // Only explicitly keyed administrative-region names may feed region heatmaps.
  if(entries.some(([key,value])=>key==="regionCode"&&!permittedRegion.has(String(value))))return [];
  return [{
   metricKey:e.metricKey,
   label:typeof e.metadata.label==="string"&&e.metadata.label.length<180&&!RESTRICTED.test(e.metadata.label)
     ? e.metadata.label : "",
   value:e.estimate,
   format:e.metadata.format==="proportion"?"proportion" as const:"mean" as const,
   segment:Object.fromEntries(entries) as Record<string,string>,
   n:e.unweightedN,
   ciLower:e.ciLower!=null&&Number.isFinite(e.ciLower)?e.ciLower:null,
   ciUpper:e.ciUpper!=null&&Number.isFinite(e.ciUpper)?e.ciUpper:null
  }];
 });
}
/** Deterministic, distinct pseudo-spatial demo patterns per answer. 
 * DEMO only: no connection to survey geography or actual responses.
 */
function demoRegionOffset(key:string,index:number,scale:number,proportion:boolean){
 let seed=2166136261;
 for(const letter of key)seed=Math.imul(seed ^ letter.charCodeAt(0),16777619)>>>0;
 let value=(seed ^ Math.imul(index+1,0x9e3779b1))>>>0;
 value=Math.imul(value^(value>>>16),0x7feb352d)>>>0;
 value=Math.imul(value^(value>>>15),0x846ca68b)>>>0;
 const signed=((value^(value>>>16))>>>0)/4294967295-.5;
 return signed*(proportion?.48:scale===100?31:1.65);
}
export function demoResultPoints():SafePublicResultPoint[]{
 const regionKeys:string[]=GREECE_REGIONS.map(x=>x.key);
 const sectors=["food_groceries","fashion_footwear","home_living","retail_intermediation","health_beauty"];
 const sizes=["1","2_4","5_9","10_19"];
 const result:SafePublicResultPoint[]=[];
 for(const [index,key] of PUBLIC_RESULTS_METRICS.entries()){
  const format=key.includes(".share.")?"proportion" as const:"mean" as const;
  const scale=key==="digital_readiness.mean"||key==="retail_friction.mean"||key==="retail_confidence.mean"?100:5;
  // Match the existing Preview design figures when the same indicator is shown
  // twice. Every value below remains explicitly DEMO and is never queried from DB.
  const sharedPreviewValues:Readonly<Record<string,number>>={
   "digital_readiness.mean":54.8,
   "retail_friction.mean":61.3,
   "retail_confidence.mean":41.7,
   "business_financial_trends_12m.operating_costs.share.increased":.724,
   "business_financial_trends_12m.profitability.share.decreased":.581,
   "business_financial_divergence.share.turnover_up_profit_down":.216,
   "sales_channels.share.own_eshop":.386,
   "digital_sales_share.share.0":.449,
   "local_customer_share.share.76_100":.637,
   "customer_acquisition_sources.share.word_of_mouth":.712,
   "online_presence_local_store_impact.share.increased_some":.394,
   "operational_friction.acquisition.mean":4.1,
   "investment_intentions.share.none":.371
  };
  const base=sharedPreviewValues[key]??(format==="proportion"
    ?0.20+((index*13)%55)/100:2.1+((index*7)%25)/10);
  const choices:[Record<string,string>,number][]=[[{},820]];
  for(const [dimension,keys] of [["regionCode",regionKeys],["sectorCode",sectors],["sizeBand",sizes]] as const){
   for(const [i,value] of keys.entries())choices.push([{[dimension]:value},64+(i*37)%160]);
  }
  for(const [i,[segment,n]] of choices.entries()){
   const isRegion=typeof segment.regionCode==="string";
   const offset=i===0?0:isRegion
      ?demoRegionOffset(key,regionKeys.indexOf(segment.regionCode),scale,format==="proportion")
      :(((i*17+index*3)%15)-7)*(format==="proportion"?0.025:scale===100?1.9:.12);
   const number=format==="proportion"?Math.min(.97,Math.max(.02,base+offset)):
     Math.min(scale,Math.max(scale===100?5:1,base+offset));
   const delta=format==="proportion"?.055:scale===100?5:.35;
   result.push({metricKey:key,label:"",format,value:number,n,segment,
    ciLower:i>0?null:Math.max(0,number-delta),
    ciUpper:i>0?null:Math.min(format==="proportion"?1:scale,number+delta)});
  }
 }
 return result;
}
export function validRegionValue(value: string):boolean{return permittedRegion.has(value);}

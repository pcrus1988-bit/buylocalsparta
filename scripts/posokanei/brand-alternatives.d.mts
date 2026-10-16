export type PriceReference = {
  source_product_id:string;name:string;brand:string|null;category:string|null;
  unit:string|null;unit_quantity:number|null
};
export type ChainOffer = {
  retailer_id:string;retailer_name?:string|null;price_eur:number
};
export type BrandSuggestion = {
  id:string;name:string;brand:string;
  packageQuantity:number;unit:"kg"|"l"|"piece";packageCount:number;
  priceEur:number;unitPriceEur:number;retailerId:string;retailerName:string;
  originalTotalEur:number;candidateTotalEur:number;
  savingsEur:number;savingPercent:number;confidence:"matched_details"
};
export type BrandIndex = Map<string,PriceReference[]>;
export function referenceQuantity(product:PriceReference):{unit:"kg"|"l"|"piece";amount:number}|null;
export function productFamily(product:PriceReference):string|null;
export function createBrandIndex(products:PriceReference[]):BrandIndex;
export function findBrandAlternatives(input:{
  sourceId:string;packages?:number;
  products:PriceReference[];
  offersByProduct:Map<string,ChainOffer[]>;
  excludedRetailerIds?:string[];
  brandIndex?:BrandIndex;maxResults?:number
}):{
  reason:string;basis:"kg"|"l"|"piece"|null;sourceAmount:number|null;
  originalTotalEur?:number;sourcePackages?:number;alternatives:BrandSuggestion[]
};

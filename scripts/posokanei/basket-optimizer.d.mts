export type BasketLine =
  | {id:string;kind:"exact";sourceProductId:string;packageCount:number;lockedRetailerId?:string}
  | {id:string;kind:"group";groupId:string;requiredBaseQuantity:number;lockedProductId?:string;lockedRetailerId?:string};
export type BasketProduct = { source_product_id:string;name:string;brand?:string|null;unit?:string|null;unit_quantity?:number|null;snapshot_date?:string };
export type BasketPrice = {source_product_id:string;snapshot_date:string;country:string;retailer_id:string;retailer_name?:string;price_eur:number;source_price_updated_at?:string|null};
export type BasketGroup = {id:string;status:string;basis:string;memberIds:string[]};
export type PlanItem = {
  lineId:string;kind:"exact"|"group";sourceProductId:string;productName:string;brand:string|null;
  retailerId:string;retailerName:string;packages:number;pricePerPackageEur:number;
  lineTotalEur:number;basis:string|null;requestedBaseQuantity:number|null;
  suppliedBaseQuantity:number|null;sourcePriceUpdatedAt:string|null;snapshotDate:string
};
export type BasketPlan = {
  complete:boolean;items:PlanItem[];missingItems:{lineId:string;reason:string}[];
  totalEur:number|null;coveredItemCount:number;storeCount:number;stores:{id:string;name:string}[]
};
export type BasketResult = {
  snapshotDate:string;country:string;lineCount:number;retailerCount:number;includedRetailerIds:string[];
  storeLimit:number;allItemsHavePrices:boolean;missingItems:{lineId:string;reason:string}[];
  bestPerLine:{lineId:string;chosen:PlanItem|null;optionsCount:number;missingReason:string|null}[];
  bestSingleStore:BasketPlan|null;bestUpToTwoStores:BasketPlan|null;cheapestAcrossAnyStores:BasketPlan|null;
  cheapestWithinStoreLimit:BasketPlan|null;
  byStoreLimit:{maxStores:number;plan:BasketPlan|null}[];
  singleStoreCandidates:{retailerId:string;complete:boolean;missingItems:{lineId:string;reason:string}[];coveredItemCount:number;totalEur:number|null}[];
  savingsVsCheapestCompleteSingleStoreEur:number|null;limitation:string
};
export function optimizeReferenceBasket(input:{
  lines:BasketLine[];products:BasketProduct[];observations:BasketPrice[];
  approvedGroups?:BasketGroup[];snapshotDate:string;country?:string;retailerIds?:string[];storeLimit?:number
}):BasketResult;

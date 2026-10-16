/** Pure, deterministic rules for offline Companion list changes.
 * These rules never modify the server-side account wishlist or cart.
 */
export type ListKind = "shopping" | "wishlist";
export type LocalItemState = {quantity:number;completed:boolean};
export type CatalogAddAction = "added" | "incremented" | "exists" | "reactivated";

function validQuantity(q:number):boolean {
 return Number.isSafeInteger(q)&&q>=1&&q<=99;
}

export function planCatalogAdd(kind:ListKind,existing:LocalItemState|null,requested=1):
 {action:CatalogAddAction;quantity:number;completed:boolean}{
 if(kind!=="shopping"&&kind!=="wishlist")throw Error("INVALID_KIND");
 if(!validQuantity(requested))throw Error("INVALID_QUANTITY");
 if(!existing)return {action:"added",quantity:requested,completed:false};
 if(!validQuantity(existing.quantity))throw Error("INVALID_EXISTING_QUANTITY");
 if(kind==="wishlist"){
  return {action:existing.completed?"reactivated":"exists",
   quantity:existing.quantity,completed:false};
 }
 const quantity=existing.quantity+requested;
 if(!validQuantity(quantity))throw Error("QUANTITY_LIMIT");
 return {action:"incremented",quantity,completed:false};
}

/** Merging a move preserves an unfinished purchase on either side.
 * Refuse overflow instead of silently discarding quantities.
 */
export function planListMoveMerge(source:LocalItemState,destination:LocalItemState):
 {quantity:number;completed:boolean}{
 if(!validQuantity(source.quantity)||!validQuantity(destination.quantity))
  throw Error("INVALID_EXISTING_QUANTITY");
 const quantity=source.quantity+destination.quantity;
 if(!validQuantity(quantity))throw Error("QUANTITY_LIMIT");
 return {quantity,completed:source.completed&&destination.completed};
}

import {createHash} from "node:crypto";
import {validCompanionCanonicalId} from "./companion-catalog-policy.ts";

export type CompanionCartLine={canonicalVariantId:string;quantity:number};
export type CompanionCartSnapshot={updatedAt:number;id:string;items:readonly {
 canonicalVariantId:string;quantity:number;priceMinor:number;title:string;available:boolean
}[]};
/** A revision that changes on cart item, quantity, price, or time changes.
 * This is an optimistic guard, not a transactional compare-and-swap.
 */
export function companionCartRevision(cart:CompanionCartSnapshot):string{
 // The commerce runtime returns Date.now() for an unsaved empty cart.
 // Ignore that volatile timestamp until a persisted cart ID exists.
 const stable={id:cart.id,updatedAt:cart.id?cart.updatedAt:0,
  items:cart.items.map(({canonicalVariantId,quantity,priceMinor,available})=>
   ({canonicalVariantId,quantity,priceMinor,available})).sort((a,b)=>a.canonicalVariantId.localeCompare(b.canonicalVariantId))};
 return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
export function parseCompanionCartPut(value:unknown):{revision:string;expectedUpdatedAt:number|null;items:CompanionCartLine[]}{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_CART");
 const body=value as Record<string,unknown>;
 if(typeof body.revision!=="string"||!/^[a-f0-9]{64}$/.test(body.revision))throw Error("INVALID_REVISION");
 if(body.expectedUpdatedAt!==null && (!Number.isSafeInteger(body.expectedUpdatedAt) || (body.expectedUpdatedAt as number)<0))throw Error("INVALID_REVISION");
 if(!Array.isArray(body.items)||body.items.length>100)throw Error("INVALID_CART");
 const seen=new Set<string>();const items:CompanionCartLine[]=[];
 for(const raw of body.items){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("INVALID_CART");
  const item=raw as Record<string,unknown>;
  if(!validCompanionCanonicalId(item.canonicalVariantId)||
    typeof item.quantity!=="number"||!Number.isSafeInteger(item.quantity)||
    item.quantity<1||item.quantity>99)throw Error("INVALID_CART");
  if(seen.has(item.canonicalVariantId))throw Error("DUPLICATE_VARIANT");
  seen.add(item.canonicalVariantId);
  items.push({canonicalVariantId:item.canonicalVariantId,quantity:item.quantity});
 }
 return {revision:body.revision,expectedUpdatedAt:body.expectedUpdatedAt as number|null,items};
}

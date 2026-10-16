import {validCanonicalPublicId} from "./canonical-id.ts";
import type {NativeCartItem} from "./companion-cart";

export function cartItemsAfterChange(
 current:readonly NativeCartItem[],variantId:string,quantity:number
):{canonicalVariantId:string;quantity:number}[]{
 if(!validCanonicalPublicId(variantId)||!Number.isSafeInteger(quantity)||quantity<0||quantity>99)
   throw Error("INVALID_CART_CHANGE");
 const items=current.map(x=>({canonicalVariantId:x.canonicalVariantId,quantity:x.quantity}))
   .filter(x=>x.canonicalVariantId!==variantId);
 if(quantity>0)items.push({canonicalVariantId:variantId,quantity});
 if(items.length>100)throw Error("CART_LIMIT");
 return items;
}
export function nextCartQuantity(current:readonly NativeCartItem[],variantId:string,delta:number):number{
 const item=current.find(x=>x.canonicalVariantId===variantId);
 const quantity=(item?.quantity??0)+delta;
 if(!Number.isSafeInteger(delta)||quantity<0||quantity>99)throw Error("INVALID_QUANTITY");
 return quantity;
}

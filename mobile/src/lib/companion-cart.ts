import {validCanonicalPublicId} from "./canonical-id";
import {cartItemsAfterChange,nextCartQuantity} from "./companion-cart-rules";
export {cartItemsAfterChange,nextCartQuantity} from "./companion-cart-rules";
import {companionAuthorizedRequest} from "./companion-session";

export type NativeCartItem={canonicalVariantId:string;title:string;quantity:number;priceMinor:number;available:boolean};
export type NativeCart={revision:string;currency:"EUR";priceFinal:false;availabilityFinal:false;items:NativeCartItem[]};
type NativeCartEnvelope={cart:NativeCart};

function validateCart(data:NativeCartEnvelope):NativeCart{
 const cart=data?.cart;
 if(!cart||typeof cart.revision!=="string"||!/^[a-f0-9]{64}$/.test(cart.revision)
   ||cart.currency!=="EUR"||cart.priceFinal!==false||cart.availabilityFinal!==false
   ||!Array.isArray(cart.items)||cart.items.length>100)throw Error("INVALID_CART_RESPONSE");
 const seen=new Set<string>();
 for(const item of cart.items){
  if(!item||!validCanonicalPublicId(item.canonicalVariantId)
   ||typeof item.title!=="string"||item.title.length>500
   ||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>99
   ||!Number.isSafeInteger(item.priceMinor)||item.priceMinor<0
   ||typeof item.available!=="boolean"||seen.has(item.canonicalVariantId))
    throw Error("INVALID_CART_RESPONSE");
  seen.add(item.canonicalVariantId);
 }
 return cart;
}
export async function loadNativeCart():Promise<NativeCart>{
 return validateCart(await companionAuthorizedRequest<NativeCartEnvelope>("/cart","GET"));
}
export async function replaceNativeCart(base:NativeCart,items:readonly {canonicalVariantId:string;quantity:number}[]):Promise<NativeCart>{
 return validateCart(await companionAuthorizedRequest<NativeCartEnvelope>("/cart","PUT",{
  revision:base.revision,items
 }));
}
export async function addNativeCartVariant(variantId:string):Promise<NativeCart>{
 const base=await loadNativeCart();
 const quantity=nextCartQuantity(base.items,variantId,1);
 return replaceNativeCart(base,cartItemsAfterChange(base.items,variantId,quantity));
}

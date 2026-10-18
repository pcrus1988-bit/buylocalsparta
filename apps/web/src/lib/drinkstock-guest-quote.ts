/** Read-only DrinkStock guest cart estimates. No payment, order insertion, or sale authority. */
export class GuestQuoteError extends Error {
 readonly code:string;
 readonly status:number;
 constructor(code:string,status:number){super(code);this.code=code;this.status=status;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_GUEST_UNIQUE_DRINKS=12;
export const MAX_GUEST_QUANTITY_PER_DRINK=10;
export const MAX_GUEST_CART_UNITS=24;
export const GUEST_PREVIEW_LIFETIME_MS=15000;
export type GuestCartLine={productId:string;quantity:number};
export type GuestCatalogDrink={id:string;name:string;priceCents:number};
export type GuestPricePreview={
 kind:"price_preview_only";checkoutEnabled:false;sessionId:string;venueId:string;tableLabel:string|null;
 quotedAt:string;expiresAt:string;currency:"EUR";totalGrossCents:number;
 lines:{productId:string;description:string;quantity:number;unitGrossCents:number;lineGrossCents:number}[];
};
export function validateGuestCart(value:unknown):GuestCartLine[]{
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new GuestQuoteError("INVALID_CART",400);
 const payload=value as Record<string,unknown>;
 if(Object.keys(payload).length!==1||!Array.isArray(payload.items))
  throw new GuestQuoteError("INVALID_CART",400);
 const items=payload.items as unknown[];
 if(items.length<1||items.length>MAX_GUEST_UNIQUE_DRINKS)
  throw new GuestQuoteError("INVALID_CART_SIZE",400);
 let units=0;
 const seen=new Set<string>();
 return items.map(raw=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new GuestQuoteError("INVALID_CART_ITEM",400);
  const line=raw as Record<string,unknown>;
  if(Object.keys(line).length!==2||typeof line.productId!=="string"||!uuid.test(line.productId)||
   !Number.isInteger(line.quantity)||Number(line.quantity)<1||Number(line.quantity)>MAX_GUEST_QUANTITY_PER_DRINK)
   throw new GuestQuoteError("INVALID_CART_ITEM",400);
  const id=line.productId.toLowerCase();
  if(seen.has(id))throw new GuestQuoteError("DUPLICATE_PRODUCT",400);
  seen.add(id);units+=Number(line.quantity);
  if(units>MAX_GUEST_CART_UNITS)throw new GuestQuoteError("CART_LIMIT_EXCEEDED",400);
  return {productId:id,quantity:Number(line.quantity)};
 });
}
/** Always rebuild with server-owned product prices, never supplied by a browser. */
export function buildGuestPricePreview(args:{
 items:readonly GuestCartLine[];products:readonly GuestCatalogDrink[];
 session:{id:string;state:string}|null;
 venueId:string;tableLabel:string|null;nowMs?:number;
}):GuestPricePreview{
 const {items,products,session,venueId,tableLabel}=args;
 if(!session||!["running","crashing"].includes(session.state))
  throw new GuestQuoteError("MARKET_NOT_TRADING",409);
 const now=args.nowMs??Date.now();
 if(!Number.isSafeInteger(now)||now<0)throw new GuestQuoteError("INVALID_TIME",500);
 const available=new Map(products.map(p=>[p.id.toLowerCase(),p]));
 let gross=0;
 const lines=items.map(x=>{
  const drink=available.get(x.productId.toLowerCase());
  if(!drink)throw new GuestQuoteError("DRINK_NOT_AVAILABLE",409);
  if(!Number.isSafeInteger(drink.priceCents)||drink.priceCents<1)
   throw new GuestQuoteError("PRICE_UNAVAILABLE",503);
  const sum=drink.priceCents*x.quantity;
  if(!Number.isSafeInteger(sum)||!Number.isSafeInteger(gross+sum))
   throw new GuestQuoteError("PRICE_UNAVAILABLE",503);
  gross+=sum;
  return {productId:drink.id,description:drink.name,quantity:x.quantity,
   unitGrossCents:drink.priceCents,lineGrossCents:sum};
 });
 if(!lines.length)throw new GuestQuoteError("INVALID_CART_SIZE",400);
 return {kind:"price_preview_only",checkoutEnabled:false,sessionId:session.id,venueId,tableLabel,
  quotedAt:new Date(now).toISOString(),expiresAt:new Date(now+GUEST_PREVIEW_LIFETIME_MS).toISOString(),
  currency:"EUR",totalGrossCents:gross,lines};
}

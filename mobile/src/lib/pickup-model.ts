import type {CompanionOrder} from "./companion-session";

/** Status is read from this customer's authenticated server-side snapshot.
 * Never derive pickup readiness from raw order text, location, or local storage.
 */
const FINISHED=new Set(["cancelled","refunded"]);
export type PickupBadge="ready"|"pending"|"closed";
export function pickupBadge(order:CompanionOrder):PickupBadge{
 if(FINISHED.has(order.status.toLowerCase()))return "closed";
 return order.pickupReady?"ready":"pending";
}

/** Snapshot returns at most 25 recent orders. No local persistence of order data. */
export function pickupOrders(orders:readonly CompanionOrder[]):CompanionOrder[]{
 return orders.filter(o=>o.hasPickup).sort((a,b)=>{
  const aa=pickupBadge(a),bb=pickupBadge(b);
  const weight=(x:PickupBadge)=>x==="ready"?0:x==="pending"?1:2;
  if(weight(aa)!==weight(bb))return weight(aa)-weight(bb);
  // API snapshot is already recent-first: stable ordering avoids invalid date parsing.
  return 0;
 });
}
export function pickupCounts(orders:readonly CompanionOrder[]){
 const pickup=pickupOrders(orders);
 return {total:pickup.length,ready:pickup.filter(o=>pickupBadge(o)==="ready").length};
}
/** No arbitrary external link or QR contents can come from an order payload. */
export function pickupOrderPath(id:string):string{
 if(typeof id!=="string"||! /^[A-Za-z0-9_-]{6,128}$/.test(id))
  throw Error("INVALID_ORDER_ID");
 return "/account/orders/"+id;
}

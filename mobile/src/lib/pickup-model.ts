import type {CompanionOrder} from "./companion-session";

/** Status is read from this customer's authenticated server-side snapshot.
 * Never derive pickup readiness from raw order text, location, or local storage.
 */
const FINISHED=new Set(["cancelled","canceled","refunded","returned","payment_failed","failed","expired","void","collected","picked_up"]);
export type PickupBadge="ready"|"pending"|"closed";
export function pickupBadge(order:CompanionOrder):PickupBadge{
 if(FINISHED.has(order.status.toLowerCase().trim()))return "closed";
 return order.hasPickup && order.pickupReady?"ready":"pending";
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

/** All-order presentation remains truthful if an old or inconsistent API snapshot
 * claims pickupReady for a delivery-only, cancelled or refunded order. */
export function orderStatusText(order:CompanionOrder):string{
 return order.hasPickup&&pickupBadge(order)==="ready"?"Έτοιμη για παραλαβή":
  order.status.trim()||"Άγνωστη κατάσταση";
}
export type OrderFilter="all"|"ready"|"pickup"|"delivery"|"closed";
export function filterOrders(orders:readonly CompanionOrder[],filter:OrderFilter):CompanionOrder[]{
 switch(filter){
  case "all":return [...orders];
  case "ready":return orders.filter(o=>o.hasPickup&&pickupBadge(o)==="ready");
  case "pickup":return orders.filter(o=>o.hasPickup);
  case "delivery":return orders.filter(o=>!o.hasPickup);
  case "closed":return orders.filter(o=>FINISHED.has(o.status.toLowerCase().trim()));
 }
}

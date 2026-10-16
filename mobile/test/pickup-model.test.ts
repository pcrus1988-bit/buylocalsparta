import assert from "node:assert/strict";
import test from "node:test";
import {pickupBadge,pickupOrders,pickupCounts,pickupOrderPath,orderStatusText,filterOrders} from "../src/lib/pickup-model.ts";
import type {CompanionOrder} from "../src/lib/companion-session.ts";

const a=(id:string,hasPickup:boolean,pickupReady:boolean,status="confirmed"):CompanionOrder=>({
 id,reference:"ORD-"+id,status,totalMinor:2599,currency:"EUR",createdAt:"2026-10-16T10:00:00Z",
 hasPickup,pickupReady
});
test("only actual customer pickup orders appear and ready ones come first",()=>{
 const orders=[a("order-a",true,false),a("ship-only",false,false),a("order-b",true,true)];
 assert.deepEqual(pickupOrders(orders).map(x=>x.id),["order-b","order-a"]);
 assert.deepEqual(pickupCounts(orders),{total:2,ready:1});
});
test("cancelled/refunded pickups never show as ready even if snapshot flag is corrupt",()=>{
 assert.equal(pickupBadge(a("order-a",true,true,"cancelled")),"closed");
 assert.equal(pickupBadge(a("order-b",true,true,"refunded")),"closed");
 assert.equal(pickupBadge(a("order-c",true,true)),"ready");
 assert.equal(pickupBadge(a("order-d",true,false)),"pending");
});
test("browser order links stay on a safely checked local account path",()=>{
 assert.equal(pickupOrderPath("ord_10027"),"/account/orders/ord_10027");
 assert.equal(pickupOrderPath("eb76531d-62f9-4f41-8550-e4a47d7c2290"),
  "/account/orders/eb76531d-62f9-4f41-8550-e4a47d7c2290");
 for(const value of ["../admin","x/../../checkout","https://evil.test","abc","ord_123?redirect=bad","ord_123%2Fcheckout"]){
  assert.throws(()=>pickupOrderPath(value),/INVALID_ORDER_ID/);
 }
});
test("empty account snapshot results in no false pickup status",()=>{
 assert.deepEqual(pickupCounts([]),{total:0,ready:0});
});

test("cancelled and refunded orders cannot appear ready on either Android screen",()=>{
 for(const status of ["cancelled","canceled","refunded","returned","failed","expired","picked_up"]){
  const order=a("order-c",true,true,status);
  assert.equal(pickupBadge(order),"closed",status);
  assert.equal(orderStatusText(order),status);
  assert.deepEqual(filterOrders([order],"ready"),[]);
  assert.equal(filterOrders([order],"closed").length,1);
 }
});
test("delivery-only order ignores a corrupted pickupReady flag",()=>{
 const delivery=a("ship-only",false,true);
 assert.equal(orderStatusText(delivery),"confirmed");
 assert.deepEqual(filterOrders([delivery],"ready"),[]);
 assert.deepEqual(filterOrders([delivery],"delivery"),[delivery]);
});
test("native order filters never erase other orders or mutate server snapshot",()=>{
 const orders=[a("pending",true,false),a("ready",true,true),a("ship",false,false),a("refund",true,true,"refunded")];
 assert.deepEqual(filterOrders(orders,"pickup").map(x=>x.id),["pending","ready","refund"]);
 assert.deepEqual(filterOrders(orders,"ready").map(x=>x.id),["ready"]);
 assert.deepEqual(filterOrders(orders,"all"),orders);
 assert.equal(orders.length,4);
});

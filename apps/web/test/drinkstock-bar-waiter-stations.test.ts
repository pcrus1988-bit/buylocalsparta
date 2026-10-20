import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 STATION_TRANSITIONS,mayStationAdvance,parseStationAssignment,isDrinkStockStation
} from "../src/lib/drinkstock-station-policy.ts";
const read=(s:string)=>readFileSync(new URL(s,import.meta.url),"utf8");
test("station assignment parser requires scope-safe fields and UUID replay key",()=>{
 const good={targetUserId:"user_verified_782",station:"bar",enabled:true,
 requestKey:"785e349c-772c-421b-b68c-7953d3e4f110"};
 assert.deepEqual(parseStationAssignment(good),good);
 for(const invalid of [
  {...good,station:"customer"},{...good,enabled:"yes"},
  {...good,requestKey:"bad"},{...good,targetUserId:""},{...good,partnerId:"other"},
  {...good,station:null},null,[good],{...good,targetUserId:"X".repeat(201)}
 ])assert.throws(()=>parseStationAssignment(invalid),/INVALID_STATION_ASSIGNMENT/);
 assert.equal(isDrinkStockStation("bar"),true);
 assert.equal(isDrinkStockStation("waiter"),true);
 assert.equal(isDrinkStockStation("manager"),false);
});
test("bar only accepts, prepares and marks ready; waiter only marks served",()=>{
 assert.deepEqual(STATION_TRANSITIONS.bar,{paid:"accepted",accepted:"preparing",preparing:"ready"});
 assert.deepEqual(STATION_TRANSITIONS.waiter,{ready:"served"});
 for(const [from,to] of [["paid","accepted"],["accepted","preparing"],["preparing","ready"]] as const){
  assert.equal(mayStationAdvance("bar",from,to),true);
  assert.equal(mayStationAdvance("waiter",from,to),false);
 }
 assert.equal(mayStationAdvance("waiter","ready","served"),true);
 assert.equal(mayStationAdvance("bar","ready","served"),false);
 assert.equal(mayStationAdvance("waiter","paid","served"),false);
});
test("station feed uses existing paid-evidenced order ledger and fiscal receipt guard",()=>{
 const fulfilment=read("../src/lib/drinkstock-fulfilment-service.ts");
 assert.match(fulfilment,/VERIFIED_PAYMENT_EVIDENCE_SQL/);
 assert.match(fulfilment,/ISSUED_RECEIPT_EVIDENCE_SQL/);
 assert.match(fulfilment,/requireStationAccess\(db,user,p,v,station\)/);
 assert.match(fulfilment,/mayStationAdvance\(station,order\.order_state,command\.next\)/);
 assert.match(fulfilment,/RECEIPT_REQUIRED_BEFORE_SERVICE/);
 assert.match(fulfilment,/else if\(role!=="owner"&&role!=="manager"\)/);
 const route=read("../src/app/api/hospitality/partners/[partnerId]/venues/[venueId]/orders/station/[station]/route.ts");
 assert.match(route,/hospitalityIdentity\(\)/);
 assert.match(route,/assertCustomerCsrf/);
 assert.match(route,/get\("origin"\)/);
 assert.match(route,/advanceStaffOrder/);
});
test("station assignment updates are manager-only, venue-scoped and auditable",()=>{
 const service=read("../src/lib/drinkstock-station-access-service.ts");
 assert.match(service,/role==="owner"\|\|role==="manager"/);
 assert.match(service,/STATION_NOT_ASSIGNED/);
 assert.match(service,/m\.status='active'/);
 assert.match(service,/a\.app_key='drinkStock' AND a\.enabled/);
 assert.match(service,/FOR UPDATE OF v/);
 assert.match(service,/INSERT INTO public\.drinkstock_staff_station_events/);
 assert.match(service,/STATION_REQUEST_CONFLICT/);
 const route=read("../src/app/api/hospitality/partners/[partnerId]/venues/[venueId]/stations/route.ts");
 assert.match(route,/assertCustomerCsrf/);
 const sql=read("../../../db/operations/20261020_drinkstock_bar_waiter_stations.sql");
 assert.match(sql,/UNIQUE\(venue_id,request_key\)/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(sql,/REVOKE ALL ON public\.drinkstock_venue_staff_stations/);
 assert.match(sql,/FOREIGN KEY \(partner_id,user_id\)/);
});
test("bar and waiter views remain separate and do not mutate guest payments",()=>{
 const board=read("../src/components/DrinkStockStationBoard.tsx");
 assert.match(board,/AUTO-REFRESH 5s/);
 assert.match(board,/Receipt pending/);
 assert.match(board,/No .* verified orders/);
 assert.doesNotMatch(board,/INSERT INTO public\.drinkstock_orders/);
 const venue=read("../src/app/hospitality/drinkStock/dashboard/[partnerId]/venues/[venueId]/page.tsx");
 assert.match(venue,/DrinkStockStationStaffManager/);
 assert.match(venue,/\/waiters/);
 assert.match(venue,/\/bar/);
});

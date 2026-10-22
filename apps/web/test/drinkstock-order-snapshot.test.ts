import test from "node:test";
import assert from "node:assert/strict";
import {persistDrinkStockOrderSnapshot,type SnapshotClient,type OrderSnapshotRequest} from "../src/lib/drinkstock-order-snapshot.ts";
import {buildGuestPricePreview} from "../src/lib/drinkstock-guest-quote.ts";

const ids={partner:"11111111-1111-4111-8111-111111111111",venue:"22222222-2222-4222-8222-222222222222",
 table:"33333333-3333-4333-8333-333333333333",session:"44444444-4444-4444-8444-444444444444",
 drink:"55555555-5555-4555-8555-555555555555",request:"66666666-6666-4666-8666-666666666666"};
const now=1700000000000;
const cart=[{productId:ids.drink,quantity:2}];
const quote=buildGuestPricePreview({items:cart,products:[{id:ids.drink,name:"Beer",priceCents:587}],
 session:{id:ids.session,state:"running"},venueId:ids.venue,tableLabel:"A1",nowMs:now});
const request:OrderSnapshotRequest={tableToken:"a".repeat(43),requestKey:ids.request,trustedQuote:quote,cart};

/** Transaction-boundary harness. Staged writes become visible only on COMMIT;
 * it deliberately fails unknown SQL so missing checks are not silently mocked.
 * PostgreSQL locking/constraints still require the separate integration smoke.
 */
function fixture(options:{price?:number;revoked?:boolean;tax?:boolean;failLine?:boolean;session?:string}={}){
 const committed=new Map<string,unknown>();let staged=new Map<string,unknown>();
 const calls:string[]=[];let releaseCount=0;
 const client:SnapshotClient={
  release(){releaseCount++;},
  async query<T extends Record<string,unknown>>(sql:string,values:unknown[]=[]){
   calls.push(sql.trim());let rows:unknown[]=[];
   if(sql==="BEGIN")staged=new Map(committed);
   else if(sql==="COMMIT"){committed.clear();for(const [k,v] of staged)committed.set(k,v);}
   else if(sql==="ROLLBACK")staged.clear();
   else if(sql.includes("SET LOCAL")||sql.includes("pg_advisory_xact_lock")){}
   else if(sql.includes("SELECT x.id::text"))rows=[{id:ids.table,partner_id:ids.partner,venue_id:ids.venue}];
   else if(sql.includes("FROM public.hospitality_partners"))rows=[{id:ids.partner}];
   else if(sql.includes("FROM public.hospitality_venues"))rows=[{id:ids.venue}];
   else if(sql.includes("FROM public.drinkstock_access_passes"))rows=options.revoked?[]:[{id:ids.table}];
   else if(sql.includes("FROM public.drinkstock_checkout_intents")){
    const saved=committed.get("snapshot");if(saved)rows=[saved];
   }
   else if(sql.includes("FROM public.drinkstock_sessions"))rows=[{id:ids.session,state:options.session??"running"}];
   else if(sql.includes("FROM public.drinkstock_venue_tax_context"))rows=[{standard_rate_confirmed:options.tax??true}];
   else if(sql.includes("FROM public.drinkstock_products"))rows=[{id:ids.drink,name:"Beer",price_cents:options.price??587,
    vat_class:"alcoholic",vat_reviewed:true,active:true}];
   else if(sql.includes("INSERT INTO public.drinkstock_orders"))staged.set("order",values);
   else if(sql.includes("INSERT INTO public.drinkstock_order_lines")){
    if(options.failLine)throw new Error("line insert failed");staged.set("lines",values);
   }
   else if(sql.includes("INSERT INTO public.drinkstock_checkout_intents"))staged.set("snapshot",{
    order_id:values[0],table_pass_id:ids.table,request_sha256:values[1],payment_request_key:values[2],
    intent:JSON.parse(String(values[3]))
   });
   else if(sql.includes("INSERT INTO public.drinkstock_order_events"))staged.set("event",values);
   else throw new Error("Unexpected SQL: "+sql);
   return {rows:rows as T[]};
  }
 };
 return {pool:{connect:async()=>client},committed,calls,releases:()=>releaseCount};
}
test("order, lines, VAT snapshot and audit event commit together with no payment activation",async()=>{
 const f=fixture();const result=await persistDrinkStockOrderSnapshot(f.pool,request,()=>now+1000);
 assert.equal(result.intent.totalGrossCents,1174);
 assert.equal(result.intent.totalNetCents+result.intent.totalVatCents,1174);
 assert.equal(result.intent.lines[0].unitGrossCents,587);
 assert.equal(result.checkoutEnabled,false);
 assert.deepEqual([...f.committed.keys()],["order","lines","snapshot","event"]);
 assert.equal(f.calls.at(-1),"COMMIT");assert.equal(f.releases(),1);
});
test("retry after quote expiry returns original order and PSP idempotency key without a second order",async()=>{
 const f=fixture();const first=await persistDrinkStockOrderSnapshot(f.pool,request,()=>now+1);
 const second=await persistDrinkStockOrderSnapshot(f.pool,request,()=>now+60000);
 assert.equal(second.replayed,true);assert.equal(second.orderId,first.orderId);
 assert.equal(second.paymentRequestKey,first.paymentRequestKey);
 assert.equal(f.calls.filter(x=>x.includes("INSERT INTO public.drinkstock_orders")).length,1);
});
test("request key cannot be reused for a different cart or price",async()=>{
 const f=fixture();await persistDrinkStockOrderSnapshot(f.pool,request,()=>now+1);
 await assert.rejects(()=>persistDrinkStockOrderSnapshot(f.pool,{...request,
  trustedQuote:{...quote,totalGrossCents:1}},()=>now+2),/CHECKOUT_REQUEST_KEY_CONFLICT/);
 assert.equal(f.committed.size,4);assert.equal(f.calls.at(-1),"ROLLBACK");
});
test("stale price, expired quote, revoked pass, unverified tax and paused market never create an order",async()=>{
 for(const opts of [{price:588},{revoked:true},{tax:false},{session:"paused"},{}]){
  const f=fixture(opts);
  await assert.rejects(()=>persistDrinkStockOrderSnapshot(f.pool,request,()=>now+(Object.keys(opts).length?1:15001)));
  assert.equal(f.committed.size,0);assert.equal(f.calls.at(-1),"ROLLBACK");assert.equal(f.releases(),1);
 }
});
test("a failed line insert rolls back the order and releases the connection",async()=>{
 const f=fixture({failLine:true});
 await assert.rejects(()=>persistDrinkStockOrderSnapshot(f.pool,request,()=>now+1),/line insert failed/);
 assert.equal(f.committed.size,0);assert.equal(f.calls.at(-1),"ROLLBACK");assert.equal(f.releases(),1);
});

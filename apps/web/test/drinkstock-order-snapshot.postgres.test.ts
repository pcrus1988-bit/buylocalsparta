import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import pg from "pg";
import {persistDrinkStockOrderSnapshot} from "../src/lib/drinkstock-order-snapshot.ts";
import {buildGuestPricePreview} from "../src/lib/drinkstock-guest-quote.ts";

const databaseUrl=process.env.DRINKSTOCK_TEST_DATABASE_URL;
test("PostgreSQL: concurrent checkout, immutable ledger, tenant/pass isolation and RLS",{skip:!databaseUrl},async()=>{
 // This writes fixtures. Refuse every remotely hosted or production database.
 const url=new URL(databaseUrl!);
 assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
 assert.ok(/^\/drinkstock_test(?:_[a-z0-9_]+)?$/.test(url.pathname));
 const pool=new pg.Pool({connectionString:databaseUrl,max:5});
 try{
  await pool.query(`DO $$ BEGIN
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  END $$;`);
  const files=["db/migrations/0451_drinkstock_sessions_orders_fiscal_foundation.sql",
   "db/operations/20261020_drinkstock_checkout_fallback.sql",
   "db/operations/20261020_drinkstock_vat_catalogue.sql",
   "db/operations/20261020_drinkstock_venue_tax_jurisdiction.sql",
   "db/operations/20261022_drinkstock_checkout_intents.sql"];
  for(const path of files)await pool.query(await readFile(new URL("../../../"+path,import.meta.url),"utf8"));
  // Re-applying the additive operation must preserve an existing ledger.
  const operation=await readFile(new URL("../../../db/operations/20261022_drinkstock_checkout_intents.sql",import.meta.url),"utf8");
  const p=randomUUID(),v=randomUUID(),s=randomUUID(),pass=randomUUID(),product=randomUUID();
  const token=randomBytes(32).toString("base64url"),requestKey=randomUUID();
  await pool.query("INSERT INTO public.hospitality_partners(id,slug,name) VALUES($1,$2,'Integration merchant')",[p,"test-"+p]);
  await pool.query("INSERT INTO public.hospitality_venues(id,partner_id,name) VALUES($1,$2,'Integration venue')",[v,p]);
  await pool.query("INSERT INTO public.hospitality_partner_apps(partner_id,app_key,enabled) VALUES($1,'drinkStock',true)",[p]);
  await pool.query(`INSERT INTO public.drinkstock_checkout_fallback(partner_id,enabled,pos_unavailable,
   merchant_authorization_reviewed,settlement_reviewed,fiscal_reviewed,reason,updated_by)
   VALUES($1,true,true,true,true,true,'Isolated integration test entitlement','test')`,[p]);
  await pool.query(`INSERT INTO public.drinkstock_sessions(id,partner_id,venue_id,state,floor_percent,ceiling_percent,created_by)
   VALUES($1,$2,$3,'running',70,145,'test')`,[s,p,v]);
  await pool.query(`INSERT INTO public.drinkstock_access_passes(id,partner_id,venue_id,kind,token_sha256,table_label,created_by)
   VALUES($1,$2,$3,'table',$4,'A1','test')`,[pass,p,v,createHash("sha256").update(token).digest("hex")]);
  await pool.query(`INSERT INTO public.drinkstock_products(id,partner_id,venue_id,name,category,
   base_cents,price_cents,min_cents,max_cents,vat_class,vat_reviewed)
   VALUES($1,$2,$3,'Beer','beer',587,587,411,851,'alcoholic',true)`,[product,p,v]);
  await pool.query(`INSERT INTO public.drinkstock_venue_tax_context(venue_id,partner_id,
   standard_rate_confirmed,review_reason,reviewed_by)
   VALUES($1,$2,true,'Isolated integration test jurisdiction','test')`,[v,p]);
  const now=Date.now(),cart=[{productId:product,quantity:2}];
  const quote=buildGuestPricePreview({items:cart,products:[{id:product,name:"Beer",priceCents:587}],
   session:{id:s,state:"running"},venueId:v,tableLabel:"A1",nowMs:now});
  const input={tableToken:token,requestKey,trustedQuote:quote,cart};
  const [first,second]=await Promise.all([
   persistDrinkStockOrderSnapshot(pool,input,()=>now+1),persistDrinkStockOrderSnapshot(pool,input,()=>now+1)
  ]);
  assert.equal(first.orderId,second.orderId);
  assert.equal(first.paymentRequestKey,second.paymentRequestKey);
  assert.equal(Number(first.replayed)+Number(second.replayed),1);
  const count=await pool.query("SELECT count(*)::int AS n FROM public.drinkstock_orders WHERE venue_id=$1",[v]);
  assert.equal(count.rows[0].n,1);
  const locked=await pool.query("SELECT payment_state,order_state,amount_gross_cents FROM public.drinkstock_orders WHERE id=$1",[first.orderId]);
  assert.deepEqual(locked.rows[0],{payment_state:"unpaid",order_state:"awaiting_payment",amount_gross_cents:1174});
  const replay=await persistDrinkStockOrderSnapshot(pool,input,()=>now+60000);
  assert.equal(replay.orderId,first.orderId);assert.equal(replay.replayed,true);
  await pool.query(operation);
  await assert.rejects(()=>pool.query("UPDATE public.drinkstock_checkout_intents SET intent='{}' WHERE order_id=$1",[first.orderId]),
   /immutable/);
  await assert.rejects(()=>persistDrinkStockOrderSnapshot(pool,{...input,trustedQuote:{...quote,totalGrossCents:1}},()=>now+1),
   /CHECKOUT_REQUEST_KEY_CONFLICT/);
  // A second table cannot recover somebody else's order using the request UUID.
  const token2=randomBytes(32).toString("base64url");
  await pool.query(`INSERT INTO public.drinkstock_access_passes(partner_id,venue_id,kind,token_sha256,table_label,created_by)
   VALUES($1,$2,'table',$3,'A2','test')`,[p,v,createHash("sha256").update(token2).digest("hex")]);
  await assert.rejects(()=>persistDrinkStockOrderSnapshot(pool,{...input,tableToken:token2},()=>now+1),/CHECKOUT_REQUEST_KEY_CONFLICT/);
  await pool.query("UPDATE public.drinkstock_products SET price_cents=588 WHERE id=$1",[product]);
  await assert.rejects(()=>persistDrinkStockOrderSnapshot(pool,{...input,requestKey:randomUUID()},()=>now+1),/PRICE_REQUOTE_REQUIRED/);
  const after=await pool.query("SELECT count(*)::int AS n FROM public.drinkstock_orders WHERE venue_id=$1",[v]);
  assert.equal(after.rows[0].n,1);
  const db=await pool.connect();
  try{
   await db.query("SET ROLE authenticated");
   await assert.rejects(()=>db.query("SELECT * FROM public.drinkstock_checkout_intents"),/permission denied/);
  }finally{await db.query("RESET ROLE");db.release();}
 }finally{await pool.end();}
});

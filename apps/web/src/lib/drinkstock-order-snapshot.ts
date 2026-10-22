import {createHash,randomUUID} from "node:crypto";
import {prepareDrinkStockCheckoutIntent,type PreparedCheckoutIntent,type TrustedCheckoutDrink} from "./drinkstock-checkout-preparation";
import {validateGuestCart,type GuestPricePreview,type GuestCartLine} from "./drinkstock-guest-quote";
import type {BeverageVatClass} from "./drinkstock-greek-vat";

export class DrinkStockOrderSnapshotError extends Error {
 readonly code:string;readonly status:number;
 constructor(code:string,status=409){super(code);this.code=code;this.status=status;}
}
export type SnapshotClient={
 query<T extends Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:readonly T[]}>;
 release():void;
};
export type SnapshotPool={connect():Promise<SnapshotClient>};
export type OrderSnapshotRequest=Readonly<{
 tableToken:string;requestKey:string;trustedQuote:GuestPricePreview;cart:readonly GuestCartLine[];
}>;
type Stored={order_id:string;table_pass_id:string;request_sha256:string;intent:PreparedCheckoutIntent;payment_request_key:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");

/** An internal ledger operation, NOT a public checkout or payment authorization.
 * Resolve the opaque table pass and lock the scope, session, tax and products
 * before persisting the exact server-validated price/VAT snapshot. No network
 * requests run inside this transaction. The separate PSP/fiscal release gate
 * must be satisfied before a worker can use its durable payment_request_key.
 */
export async function persistDrinkStockOrderSnapshot(
 pool:SnapshotPool,input:OrderSnapshotRequest,now:()=>number=Date.now
){
 if(!/^[A-Za-z0-9_-]{43}$/.test(input.tableToken)||!UUID.test(input.requestKey))
  throw new DrinkStockOrderSnapshotError("INVALID_CHECKOUT_REQUEST",400);
 const cart=validateGuestCart({items:input.cart});
 const q=input.trustedQuote;
 // Explicit canonical fields make retries insensitive to JSON property order
 // and cart ordering, but never allow a key to be reused for different prices.
 const digest=hash(JSON.stringify({
  session:q.sessionId,venue:q.venueId,quotedAt:q.quotedAt,expiresAt:q.expiresAt,
  currency:q.currency,kind:q.kind,checkoutEnabled:q.checkoutEnabled,total:q.totalGrossCents,
  cart:[...cart].sort((a,b)=>a.productId.localeCompare(b.productId)),
  lines:[...q.lines].sort((a,b)=>a.productId.localeCompare(b.productId)).map(l=>
   [l.productId.toLowerCase(),l.description,l.quantity,l.unitGrossCents,l.lineGrossCents])
 }));
 const db=await pool.connect();let committed=false;
 try{
  await db.query("BEGIN");
  await db.query("SET LOCAL statement_timeout='8s'");
  const resolved=await db.query<{id:string;partner_id:string;venue_id:string}>(`
   SELECT x.id::text,x.partner_id::text,x.venue_id::text
   FROM public.drinkstock_access_passes x
   WHERE x.token_sha256=$1 AND x.kind='table' AND x.revoked_at IS NULL
  `,[hash(input.tableToken)]);
  const pass=resolved.rows[0];
  if(!pass)throw new DrinkStockOrderSnapshotError("TABLE_PASS_UNAVAILABLE",404);
  // Admin entitlement changes lock the partner first. Take that lock before
  // the venue as well, rather than relying on the join planner's lock order.
  const partner=await db.query<{id:string}>(`
   SELECT id::text FROM public.hospitality_partners
   WHERE id=$1::uuid AND status='active' FOR SHARE
  `,[pass.partner_id]);
  if(!partner.rows.length)throw new DrinkStockOrderSnapshotError("CHECKOUT_NOT_AUTHORIZED",403);
  // Match the manager's venue-before-session locking order. Do not keep a pass
  // lock while waiting for the venue (pass revocation also locks the venue).
  const scope=await db.query<{id:string}>(`
   SELECT v.id::text FROM public.hospitality_venues v
   JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
   JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
   JOIN public.drinkstock_checkout_fallback f ON f.partner_id=p.id
    AND f.enabled AND f.pos_unavailable AND f.merchant_authorization_reviewed
    AND f.settlement_reviewed AND f.fiscal_reviewed
   WHERE v.id=$1::uuid AND v.partner_id=$2::uuid AND v.status='active'
   FOR SHARE OF v,a,f
  `,[pass.venue_id,pass.partner_id]);
  if(!scope.rows.length)throw new DrinkStockOrderSnapshotError("CHECKOUT_NOT_AUTHORIZED",403);
  const validPass=await db.query<{id:string}>(`
   SELECT id::text FROM public.drinkstock_access_passes
   WHERE id=$1::uuid AND partner_id=$2::uuid AND venue_id=$3::uuid
    AND token_sha256=$4 AND kind='table' AND revoked_at IS NULL FOR SHARE
  `,[pass.id,pass.partner_id,pass.venue_id,hash(input.tableToken)]);
  if(!validPass.rows.length)throw new DrinkStockOrderSnapshotError("TABLE_PASS_UNAVAILABLE",404);
  // Serialize one request without serializing independent checkout requests.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[
   pass.venue_id+":"+input.requestKey.toLowerCase()]);
  const earlier=await db.query<Stored>(`
   SELECT s.order_id::text,o.table_pass_id::text,s.request_sha256,s.intent,s.payment_request_key::text
   FROM public.drinkstock_checkout_intents s
   JOIN public.drinkstock_orders o ON o.id=s.order_id
   WHERE o.venue_id=$1::uuid AND o.request_key=$2::uuid AND o.partner_id=$3::uuid
  `,[pass.venue_id,input.requestKey,pass.partner_id]);
  const saved=earlier.rows[0];
  if(saved){
   if(saved.table_pass_id!==pass.id||saved.request_sha256!==digest)
    throw new DrinkStockOrderSnapshotError("CHECKOUT_REQUEST_KEY_CONFLICT");
   await db.query("COMMIT");committed=true;
   return {orderId:saved.order_id,intent:saved.intent,paymentRequestKey:saved.payment_request_key,replayed:true,checkoutEnabled:false as const};
  }
  const sessions=await db.query<{id:string;state:string}>(`
   SELECT id::text,state FROM public.drinkstock_sessions
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid
   ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE
  `,[pass.partner_id,pass.venue_id]);
  const session=sessions.rows[0];
  if(!session)throw new DrinkStockOrderSnapshotError("SESSION_NOT_TRADING");
  const tax=await db.query<{standard_rate_confirmed:boolean}>(`
   SELECT standard_rate_confirmed FROM public.drinkstock_venue_tax_context
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid
    AND service_mode='dine_in' AND jurisdiction='standard' FOR SHARE
  `,[pass.partner_id,pass.venue_id]);
  if(!tax.rows[0]?.standard_rate_confirmed)
   throw new DrinkStockOrderSnapshotError("VAT_JURISDICTION_UNVERIFIED");
  const products=await db.query<{
   id:string;name:string;price_cents:number;vat_class:BeverageVatClass;vat_reviewed:boolean;active:boolean;
  }>(`
   SELECT id::text,name,price_cents,vat_class,vat_reviewed,active
   FROM public.drinkstock_products WHERE partner_id=$1::uuid AND venue_id=$2::uuid
    AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE
  `,[pass.partner_id,pass.venue_id,cart.map(x=>x.productId)]);
  const lockedProducts:TrustedCheckoutDrink[]=products.rows.map(p=>({
   id:p.id,partnerId:pass.partner_id,venueId:pass.venue_id,name:p.name,
   priceCents:Number(p.price_cents),vatClass:p.vat_class,vatReviewed:p.vat_reviewed,active:p.active
  }));
  const intent=prepareDrinkStockCheckoutIntent({
   partnerId:pass.partner_id,venueId:pass.venue_id,tablePassId:pass.id,session,
   trustedQuote:q,cart,lockedProducts,mode:"dine_in",jurisdiction:"standard",
   islandEligibilityVerified:false,nowMs:now()
  });
  if(intent.totalGrossCents<50||intent.totalGrossCents>400000)
   throw new DrinkStockOrderSnapshotError("CHECKOUT_AMOUNT_OUT_OF_RANGE",400);
  const orderId=randomUUID(),paymentRequestKey=randomUUID();
  await db.query(`
   INSERT INTO public.drinkstock_orders(id,partner_id,venue_id,session_id,table_pass_id,
    request_key,order_state,payment_state,fiscal_state,amount_gross_cents,currency)
   VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
    'awaiting_payment','unpaid','not_requested',$7,'EUR')
  `,[orderId,pass.partner_id,pass.venue_id,session.id,pass.id,input.requestKey,intent.totalGrossCents]);
  for(const l of intent.lines)await db.query(`
   INSERT INTO public.drinkstock_order_lines(order_id,product_id,description,quantity,unit_gross_cents,vat_rate_basis_points)
   VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)
  `,[orderId,l.productId,l.description,l.quantity,l.unitGrossCents,l.vatRateBasisPoints]);
  await db.query(`
   INSERT INTO public.drinkstock_checkout_intents(order_id,request_sha256,payment_request_key,intent)
   VALUES($1::uuid,$2,$3::uuid,$4::jsonb)
  `,[orderId,digest,paymentRequestKey,JSON.stringify(intent)]);
  await db.query(`
   INSERT INTO public.drinkstock_order_events(order_id,actor_type,from_state,to_state,request_key)
   VALUES($1::uuid,'customer',NULL,'awaiting_payment',$2::uuid)
  `,[orderId,input.requestKey]);
  await db.query("COMMIT");committed=true;
  return {orderId,intent,paymentRequestKey,replayed:false,checkoutEnabled:false as const};
 }catch(e){if(!committed)try{await db.query("ROLLBACK");}catch{}throw e;}
 finally{db.release();}
}

/** Lazy production binding keeps unit/transaction tests free of DB bootstrapping. */
export async function createDrinkStockOrderSnapshot(input:OrderSnapshotRequest){
 const {getProductionPostgresRuntime,productionDatabaseConfigured}=await import("./postgres-runtime");
 if(!productionDatabaseConfigured())throw new DrinkStockOrderSnapshotError("DATABASE_UNAVAILABLE",503);
 return persistDrinkStockOrderSnapshot(getProductionPostgresRuntime().sqlPool,input);
}

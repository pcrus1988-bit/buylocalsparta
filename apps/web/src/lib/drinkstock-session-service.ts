import {createHash,randomBytes} from "node:crypto";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {operationalSessionCanStart} from "./drinkstock-screen-showcase";
import {isTvFeedMode,mayDisplayActualOrder} from "./drinkstock-screen-feed-policy";
import {EXPIRE_DRINKSTOCK_CRASH_SQL} from "./drinkstock-session-recovery";
import {checkoutFallbackByPartner,type CheckoutFallbackSnapshot} from "./drinkstock-checkout-fallback-service";
export class SessionError extends Error{constructor(public readonly code:string,public readonly status:number){super(code);}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
type State="running"|"paused"|"crashing"|"ended"|"scheduled";
type R={id:string;state:State;revision:number;floor_percent:number;ceiling_percent:number;created_at:Date;started_at:Date|null;ended_at:Date|null;crash_until:Date|null};
type Db={query<T extends Record<string,unknown>>(sql:string,values?:readonly unknown[]):Promise<{rows:readonly T[];rowCount:number}>};
export type ScreenFeedMode="simulation"|"actual";
export type VerifiedScreenTrade={productId:string;description:string;quantity:number;paidAt:string};
export type SessionView={serverNow:string;feedMode?:ScreenFeedMode;actualTrades?:VerifiedScreenTrade[];
 checkoutFallback?:CheckoutFallbackSnapshot;venue:{id:string;partnerId:string;name:string;role?:string};
 session:{id:string;state:State;revision:number;floorPercent:number;ceilingPercent:number;crashUntil:string|null;startedAt:string|null}|null;
 passes:{id:string;kind:string;tableLabel:string|null;feedMode:ScreenFeedMode}[];
 products:{id:string;name:string;category:string;baseCents:number;priceCents:number}[];
 tableLabel?:string|null;
 /** Rehearsal demand signals only; never imply confirmed customer orders. */
 signals?:{id:string;productId:string;productName:string;createdAt:string}[];}
function checkScope(partnerId:string,venueId:string){if(!UUID.test(partnerId)||!UUID.test(venueId))throw new SessionError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new SessionError("DATABASE_UNAVAILABLE",503);}
function session(r:R|undefined):SessionView["session"]{
 if(!r)return null;
 const expired=r.state==="crashing"&&r.crash_until&&new Date(r.crash_until).getTime()<=Date.now();
 return {id:r.id,state:expired?"running":r.state,revision:r.revision,
 floorPercent:Number(r.floor_percent),ceilingPercent:Number(r.ceiling_percent),
 crashUntil:!expired&&r.crash_until?new Date(r.crash_until).toISOString():null,
 startedAt:r.started_at?new Date(r.started_at).toISOString():null};
}
async function current(db:Db,p:string,v:string,locked=false){
 const r=await db.query<R>(`SELECT id::text,state,revision,floor_percent,ceiling_percent,created_at,started_at,ended_at,crash_until
 FROM public.drinkstock_sessions WHERE partner_id=$1::uuid AND venue_id=$2::uuid
 ORDER BY created_at DESC,id DESC LIMIT 1 ${locked?"FOR UPDATE":""}`,[p,v]);
 return r.rows[0];
}
async function venue(db:Db,userId:string,p:string,v:string,locked=false){
 const r=await db.query<{id:string;partner_id:string;name:string;role:string}>(`SELECT v.id::text,v.partner_id::text,v.name,m.role
 FROM public.hospitality_venues v
 JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
 JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id AND m.user_id=$1 AND m.status='active'
 WHERE v.id=$3::uuid AND v.partner_id=$2::uuid AND v.status='active'
 AND (m.role<>'staff' OR EXISTS(
  SELECT 1 FROM public.drinkstock_venue_staff_stations grants
  WHERE grants.partner_id=v.partner_id AND grants.venue_id=v.id AND grants.user_id=m.user_id
 )) ${locked?"FOR UPDATE OF v":""}`,[userId,p,v]);
 if(!r.rows[0])throw new SessionError("NOT_FOUND",404);
 return r.rows[0];
}
async function products(db:Db,p:string,v:string){
 const r=await db.query<{id:string;name:string;category:string;base_cents:number;price_cents:number}>(`SELECT id::text,name,category,base_cents,price_cents
 FROM public.drinkstock_products WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active
 ORDER BY name LIMIT 60`,[p,v]);
 return r.rows.map(row=>({id:row.id,name:row.name,category:row.category,baseCents:Number(row.base_cents),priceCents:Number(row.price_cents)}));
}
export async function managerSessionView(userId:string,p:string,v:string):Promise<SessionView>{
 checkScope(p,v);const db=getProductionPostgresRuntime().sqlPool;
 const access=await venue(db,userId,p,v);
 const [s,d,passes,checkoutFallback]=await Promise.all([current(db,p,v),products(db,p,v),
  db.query<{id:string;kind:string;table_label:string|null;feed_mode:ScreenFeedMode}>(`SELECT id::text,kind,table_label,feed_mode
 FROM public.drinkstock_access_passes WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND revoked_at IS NULL
 ORDER BY created_at DESC LIMIT 100`,[p,v]),checkoutFallbackByPartner(p)]);
 return {serverNow:new Date().toISOString(),venue:{id:v,partnerId:p,name:access.name,role:access.role},
  session:session(s),products:d,checkoutFallback,passes:passes.rows.map(x=>({id:x.id,kind:x.kind,tableLabel:x.table_label,feedMode:x.feed_mode}))};
}
export type SessionAction={action:"start"|"pause"|"resume"|"crash"|"end"|"create_screen"|"create_table"|"revoke_pass"|"set_screen_feed";
 requestKey:string;tableLabel?:string;passId?:string;feedMode?:ScreenFeedMode;expectedRevision?:number};
export function validateSessionAction(value:unknown):SessionAction{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new SessionError("BAD_ACTION",400);
 const b=value as Record<string,unknown>;
 if(!["start","pause","resume","crash","end","create_screen","create_table","revoke_pass","set_screen_feed"].includes(String(b.action))
 ||typeof b.requestKey!=="string"||!UUID.test(b.requestKey))throw new SessionError("BAD_ACTION",400);
 if(b.expectedRevision!==undefined&&(!Number.isInteger(b.expectedRevision)||Number(b.expectedRevision)<1))
 throw new SessionError("BAD_REVISION",400);
 if(b.action==="create_table"&&(typeof b.tableLabel!=="string"||!/^[A-Za-z0-9 Α-Ωα-ω_-]{1,30}$/.test(b.tableLabel)))
 throw new SessionError("BAD_TABLE_LABEL",400);
 if((b.action==="revoke_pass"||b.action==="set_screen_feed")&&(typeof b.passId!=="string"||!UUID.test(b.passId)))
 throw new SessionError("BAD_PASS",400);
 if(b.action==="set_screen_feed"&&!isTvFeedMode(b.feedMode))
 throw new SessionError("BAD_FEED_MODE",400);
 return b as SessionAction;
}
export async function sessionCommand(userId:string,p:string,v:string,a:SessionAction){
 checkScope(p,v);const db=await getProductionPostgresRuntime().sqlPool.connect();let plainToken:string|undefined;
 try{
 await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
 const actor=await venue(db,userId,p,v,true);
 if(!["owner","manager"].includes(actor.role))throw new SessionError("MANAGER_ONLY",403);
 const previous=await db.query<{id:string}>(`SELECT id::text FROM public.drinkstock_session_actions
 WHERE venue_id=$1::uuid AND partner_id=$2::uuid AND request_key=$3::uuid`,[v,p,a.requestKey]);
 if(previous.rows.length){await db.query("COMMIT");return {view:await managerSessionView(userId,p,v),replayed:true};}
 // Crash expiration is automatic, not a user command: it must not invalidate
 // the revision shown by GET or permanently block pause/end after 60 seconds.
 await db.query(EXPIRE_DRINKSTOCK_CRASH_SQL,[v,p]);
 let s=await current(db,p,v,true);
 if(a.expectedRevision!==undefined&&s&&s.revision!==a.expectedRevision)throw new SessionError("STALE_REVISION",409);
 if(a.action==="start"){
  if(s&&s.state!=="ended")throw new SessionError("SESSION_ALREADY_OPEN",409);
  const count=await db.query<{n:number}>(`SELECT COUNT(*)::int AS n FROM public.drinkstock_products
  WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active`,[p,v]);
  if(!Number(count.rows[0]?.n))throw new SessionError("EMPTY_MENU",409);
  const config=await db.query<{floor_percent:number;ceiling_percent:number;rehearsal_enabled:boolean}>(`SELECT floor_percent,ceiling_percent,rehearsal_enabled
  FROM public.drinkstock_venue_settings WHERE partner_id=$1::uuid AND venue_id=$2::uuid`,[p,v]);
  if(!operationalSessionCanStart(Boolean(config.rows[0]?.rehearsal_enabled)))
   throw new SessionError("STOP_REHEARSAL_BEFORE_SESSION",409);
  const floor=config.rows[0]?.floor_percent??70,ceil=config.rows[0]?.ceiling_percent??145;
  // Each new session starts at the product's base price. Never inherit rehearsal
  // prices or a preceding venue session's closing market prices.
  await db.query(`UPDATE public.drinkstock_products
   SET price_cents=base_cents,updated_at=now()
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active`,[p,v]);
  await db.query(`INSERT INTO public.drinkstock_sessions
   (partner_id,venue_id,state,floor_percent,ceiling_percent,created_by,started_at)
   VALUES($1::uuid,$2::uuid,'running',$3,$4,$5,now())`,[p,v,floor,ceil,userId]);
  s=await current(db,p,v,true);
 }else if(["pause","resume","crash","end"].includes(a.action)){
  if(!s||s.state==="ended")throw new SessionError("NO_OPEN_SESSION",409);
  if(a.action==="pause"&&!["running","crashing"].includes(s.state)||
     a.action==="resume"&&s.state!=="paused"||
     a.action==="crash"&&s.state!=="running")throw new SessionError("BAD_TRANSITION",409);
  const state=a.action==="resume"?"running":a.action==="crash"?"crashing":a.action==="end"?"ended":"paused";
  await db.query(`UPDATE public.drinkstock_sessions SET state=$3,revision=revision+1,
  crash_until=CASE WHEN $3='crashing' THEN now()+interval '60 seconds' ELSE NULL END,
  ended_at=CASE WHEN $3='ended' THEN now() ELSE ended_at END
  WHERE id=$4::uuid AND partner_id=$1::uuid AND venue_id=$2::uuid`,[p,v,state,s.id]);
 }else if(a.action==="create_screen"||a.action==="create_table"){
  plainToken=randomBytes(32).toString("base64url");
  const hash=createHash("sha256").update(plainToken).digest("hex");
  await db.query(`INSERT INTO public.drinkstock_access_passes
  (partner_id,venue_id,kind,token_sha256,table_label,created_by)
  VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)`,
  [p,v,a.action==="create_screen"?"screen":"table",hash,a.action==="create_table"?a.tableLabel:null,userId]);
 }else if(a.action==="revoke_pass"){
  const removed=await db.query(`UPDATE public.drinkstock_access_passes SET revoked_at=now()
  WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND id=$3::uuid AND revoked_at IS NULL`,[p,v,a.passId]);
  if(!removed.rowCount)throw new SessionError("PASS_NOT_FOUND",404);
 }else if(a.action==="set_screen_feed"){
  const updated=await db.query(`UPDATE public.drinkstock_access_passes SET feed_mode=$4
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND id=$3::uuid
    AND kind='screen' AND revoked_at IS NULL RETURNING id`,[p,v,a.passId,a.feedMode]);
  if(!updated.rowCount)throw new SessionError("SCREEN_PASS_NOT_FOUND",404);
 }
 await db.query(`INSERT INTO public.drinkstock_session_actions
 (partner_id,venue_id,session_id,request_key,action,actor_user_id,details)
 VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::jsonb)`,[p,v,s?.id??null,a.requestKey,a.action,userId,
 a.action==="set_screen_feed"?JSON.stringify({screenPassId:a.passId,feedMode:a.feedMode}):"{}"]);
 await db.query("COMMIT");
 }catch(err){try{await db.query("ROLLBACK");}catch{}throw err;}finally{db.release();}
 return {view:await managerSessionView(userId,p,v),token:plainToken};
}
export async function publicSessionView(token:string,kind:"table"|"screen"):Promise<SessionView>{
 if(!TOKEN.test(token))throw new SessionError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new SessionError("DATABASE_UNAVAILABLE",503);
 const db=getProductionPostgresRuntime().sqlPool;
 const hash=createHash("sha256").update(token).digest("hex");
 const r=await db.query<{partner_id:string;venue_id:string;name:string;table_label:string|null;feed_mode:ScreenFeedMode}>(`
 SELECT v.partner_id::text,v.id::text AS venue_id,v.name,a.table_label,a.feed_mode
 FROM public.drinkstock_access_passes a
 JOIN public.hospitality_venues v ON v.id=a.venue_id AND v.partner_id=a.partner_id AND v.status='active'
 JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps app ON app.partner_id=p.id AND app.app_key='drinkStock' AND app.enabled
 WHERE a.token_sha256=$1 AND a.kind=$2 AND a.revoked_at IS NULL LIMIT 1`,[hash,kind]);
 if(!r.rows[0])throw new SessionError("NOT_FOUND",404);
 const x=r.rows[0];
 const [s,d]=await Promise.all([current(db,x.partner_id,x.venue_id),products(db,x.partner_id,x.venue_id)]);
 // Only show venue-scoped, non-commercial rehearsal demand. Never expose actors.
 const signals=kind==="screen"&&x.feed_mode==="simulation"?await db.query<{id:string;product_id:string;product_name:string;created_at:Date}>(`
 SELECT e.id::text,e.selected_product_id::text AS product_id,d.name AS product_name,e.created_at
 FROM public.drinkstock_market_events e
 JOIN public.drinkstock_products d ON d.id=e.selected_product_id
  AND d.partner_id=e.partner_id AND d.venue_id=e.venue_id
 WHERE e.partner_id=$1::uuid AND e.venue_id=$2::uuid AND e.event_type='demand'
  AND ($3::timestamptz IS NULL OR e.created_at >= $3::timestamptz)
 ORDER BY e.created_at DESC,e.id DESC LIMIT 12
 `,[x.partner_id,x.venue_id,s?.started_at??null]):{rows:[]};
 // Paid sales are shown only when there is a matching server-persisted provider
 // verification event. Avoid order IDs, table labels, customer details, amounts
 // and other personal/financial data on a publicly accessible TV.
 const confirmed=kind==="screen"&&x.feed_mode==="actual"&&s?.id?
 await db.query<{product_id:string;description:string;quantity:number;paid_at:Date;order_state:string;payment_state:string;event_type:string}>(`
 SELECT l.product_id::text AS product_id,l.description,l.quantity,verified.received_at AS paid_at,verified.event_type,o.order_state,o.payment_state
 FROM public.drinkstock_orders o
 JOIN LATERAL (
   SELECT e.received_at,e.event_type FROM public.drinkstock_payment_events e
   WHERE e.order_id=o.id AND e.event_type='payment_verified'
     AND e.amount_cents=o.amount_gross_cents
     AND length(btrim(e.provider))>1 AND lower(btrim(e.provider)) NOT IN ('demo','simulation','test')
     AND length(btrim(e.provider_event_id))>0
     AND e.payload_sha256 ~ '^[0-9a-f]{64}
 ) verified ON TRUE
 JOIN public.drinkstock_order_lines l ON l.order_id=o.id
 JOIN public.drinkstock_products d ON d.id=l.product_id
   AND d.partner_id=o.partner_id AND d.venue_id=o.venue_id
 WHERE o.partner_id=$1::uuid AND o.venue_id=$2::uuid
  AND o.session_id=$3::uuid AND o.payment_state='paid'
  AND o.order_state IN ('paid','accepted','preparing','ready','served')
 ORDER BY verified.received_at DESC,o.id DESC,l.id DESC LIMIT 16
 `,[x.partner_id,x.venue_id,s.id]):{rows:[]};
 return {serverNow:new Date().toISOString(),venue:{id:x.venue_id,partnerId:x.partner_id,name:x.name},session:session(s),products:d,passes:[],tableLabel:x.table_label,
 ...(kind==="screen"?{feedMode:x.feed_mode}:{}),
 ...(kind==="screen"&&x.feed_mode==="actual"?{actualTrades:confirmed.rows.filter(q=>mayDisplayActualOrder(q.payment_state,q.order_state,q.event_type,true)).map(q=>({
 productId:q.product_id,description:q.description,quantity:Number(q.quantity),
 paidAt:new Date(q.paid_at).toISOString()}))}:{}),
 signals:signals.rows.map(q=>({id:q.id,productId:q.product_id,productName:q.product_name,createdAt:new Date(q.created_at).toISOString()}))};
}

   ORDER BY e.received_at DESC LIMIT 1
 ) verified ON TRUE
 JOIN public.drinkstock_order_lines l ON l.order_id=o.id
 JOIN public.drinkstock_products d ON d.id=l.product_id
   AND d.partner_id=o.partner_id AND d.venue_id=o.venue_id
 WHERE o.partner_id=$1::uuid AND o.venue_id=$2::uuid
  AND o.session_id=$3::uuid AND o.payment_state='paid'
  AND o.order_state IN ('paid','accepted','preparing','ready','served')
 ORDER BY verified.received_at DESC,o.id DESC,l.id DESC LIMIT 16
 `,[x.partner_id,x.venue_id,s.id]):{rows:[]};
 return {serverNow:new Date().toISOString(),venue:{id:x.venue_id,partnerId:x.partner_id,name:x.name},session:session(s),products:d,passes:[],tableLabel:x.table_label,
 ...(kind==="screen"?{feedMode:x.feed_mode}:{}),
 ...(kind==="screen"&&x.feed_mode==="actual"?{actualTrades:confirmed.rows.filter(q=>mayDisplayActualOrder(q.payment_state,q.order_state,q.event_type,true)).map(q=>({
 productId:q.product_id,description:q.description,quantity:Number(q.quantity),
 paidAt:new Date(q.paid_at).toISOString()}))}:{}),
 signals:signals.rows.map(q=>({id:q.id,productId:q.product_id,productName:q.product_name,createdAt:new Date(q.created_at).toISOString()}))};
}

import {createHash,randomBytes} from "node:crypto";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
export class SessionError extends Error{constructor(public readonly code:string,public readonly status:number){super(code);}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
type State="running"|"paused"|"crashing"|"ended"|"scheduled";
type R={id:string;state:State;revision:number;floor_percent:number;ceiling_percent:number;created_at:Date;started_at:Date|null;ended_at:Date|null;crash_until:Date|null};
type Db={query<T extends Record<string,unknown>>(sql:string,values?:readonly unknown[]):Promise<{rows:T[];rowCount:number|null}>};
export type SessionView={venue:{id:string;partnerId:string;name:string;role?:string};
 session:{id:string;state:State;revision:number;floorPercent:number;ceilingPercent:number;crashUntil:string|null;startedAt:string|null}|null;
 passes:{id:string;kind:string;tableLabel:string|null}[];
 products:{id:string;name:string;category:string;priceCents:number}[];
 tableLabel?:string|null};
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
 WHERE v.id=$3::uuid AND v.partner_id=$2::uuid AND v.status='active' ${locked?"FOR UPDATE OF v":""}`,[userId,p,v]);
 if(!r.rows[0])throw new SessionError("NOT_FOUND",404);
 return r.rows[0];
}
async function products(db:Db,p:string,v:string){
 const r=await db.query<{id:string;name:string;category:string;price_cents:number}>(`SELECT id::text,name,category,price_cents
 FROM public.drinkstock_products WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active
 ORDER BY name LIMIT 60`,[p,v]);
 return r.rows.map(row=>({id:row.id,name:row.name,category:row.category,priceCents:Number(row.price_cents)}));
}
export async function managerSessionView(userId:string,p:string,v:string):Promise<SessionView>{
 checkScope(p,v);const db=getProductionPostgresRuntime().sqlPool;
 const access=await venue(db,userId,p,v);
 const [s,d,passes]=await Promise.all([current(db,p,v),products(db,p,v),
  db.query<{id:string;kind:string;table_label:string|null}>(`SELECT id::text,kind,table_label
 FROM public.drinkstock_access_passes WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND revoked_at IS NULL
 ORDER BY created_at DESC LIMIT 100`,[p,v])]);
 return {venue:{id:v,partnerId:p,name:access.name,role:access.role},
  session:session(s),products:d,passes:passes.rows.map(x=>({id:x.id,kind:x.kind,tableLabel:x.table_label}))};
}
export type SessionAction={action:"start"|"pause"|"resume"|"crash"|"end"|"create_screen"|"create_table"|"revoke_pass";
 requestKey:string;tableLabel?:string;passId?:string;expectedRevision?:number};
export function validateSessionAction(value:unknown):SessionAction{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new SessionError("BAD_ACTION",400);
 const b=value as Record<string,unknown>;
 if(!["start","pause","resume","crash","end","create_screen","create_table","revoke_pass"].includes(String(b.action))
 ||typeof b.requestKey!=="string"||!UUID.test(b.requestKey))throw new SessionError("BAD_ACTION",400);
 if(b.expectedRevision!==undefined&&(!Number.isInteger(b.expectedRevision)||Number(b.expectedRevision)<1))
 throw new SessionError("BAD_REVISION",400);
 if(b.action==="create_table"&&(typeof b.tableLabel!=="string"||!/^[A-Za-z0-9 Α-Ωα-ω_-]{1,30}$/.test(b.tableLabel)))
 throw new SessionError("BAD_TABLE_LABEL",400);
 if(b.action==="revoke_pass"&&(typeof b.passId!=="string"||!UUID.test(b.passId)))
 throw new SessionError("BAD_PASS",400);
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
 await db.query(`UPDATE public.drinkstock_sessions SET state='running',crash_until=NULL,revision=revision+1
 WHERE venue_id=$1::uuid AND partner_id=$2::uuid AND state='crashing' AND crash_until<=now()`,[v,p]);
 let s=await current(db,p,v,true);
 if(a.expectedRevision!==undefined&&s&&s.revision!==a.expectedRevision)throw new SessionError("STALE_REVISION",409);
 if(a.action==="start"){
  if(s&&s.state!=="ended")throw new SessionError("SESSION_ALREADY_OPEN",409);
  const count=await db.query<{n:number}>(`SELECT COUNT(*)::int AS n FROM public.drinkstock_products
  WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND active`,[p,v]);
  if(!Number(count.rows[0]?.n))throw new SessionError("EMPTY_MENU",409);
  const config=await db.query<{floor_percent:number;ceiling_percent:number}>(`SELECT floor_percent,ceiling_percent
  FROM public.drinkstock_venue_settings WHERE partner_id=$1::uuid AND venue_id=$2::uuid`,[p,v]);
  const floor=config.rows[0]?.floor_percent??70,ceil=config.rows[0]?.ceiling_percent??145;
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
 }
 await db.query(`INSERT INTO public.drinkstock_session_actions
 (partner_id,venue_id,session_id,request_key,action,actor_user_id)
 VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6)`,[p,v,s?.id??null,a.requestKey,a.action,userId]);
 await db.query("COMMIT");
 }catch(err){try{await db.query("ROLLBACK");}catch{}throw err;}finally{db.release();}
 return {view:await managerSessionView(userId,p,v),token:plainToken};
}
export async function publicSessionView(token:string,kind:"table"|"screen"):Promise<SessionView>{
 if(!TOKEN.test(token))throw new SessionError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new SessionError("DATABASE_UNAVAILABLE",503);
 const db=getProductionPostgresRuntime().sqlPool;
 const hash=createHash("sha256").update(token).digest("hex");
 const r=await db.query<{partner_id:string;venue_id:string;name:string;table_label:string|null}>(`
 SELECT v.partner_id::text,v.id::text AS venue_id,v.name,a.table_label
 FROM public.drinkstock_access_passes a
 JOIN public.hospitality_venues v ON v.id=a.venue_id AND v.partner_id=a.partner_id AND v.status='active'
 JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps app ON app.partner_id=p.id AND app.app_key='drinkStock' AND app.enabled
 WHERE a.token_sha256=$1 AND a.kind=$2 AND a.revoked_at IS NULL LIMIT 1`,[hash,kind]);
 if(!r.rows[0])throw new SessionError("NOT_FOUND",404);
 const x=r.rows[0];
 const [s,d]=await Promise.all([current(db,x.partner_id,x.venue_id),products(db,x.partner_id,x.venue_id)]);
 return {venue:{id:x.venue_id,partnerId:x.partner_id,name:x.name},session:session(s),products:d,passes:[],tableLabel:x.table_label};
}

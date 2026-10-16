import { createHash, randomBytes } from "node:crypto";
import {COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI,
  validChallenge,challengeForVerifier,sessionToken} from "./companion-pkce";
export {COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI,validChallenge,validState,validClient,
  challengeForVerifier,sessionToken} from "./companion-pkce";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 86400 * 1000;
const ABSOLUTE_TTL_MS = 90 * 86400 * 1000;
export type CompanionTokens = {
  accessToken:string;refreshToken:string;tokenType:"Bearer";expiresIn:number;
};
export function companionEnabled() {
  // Gate both auth and protected native data until its schema, tests and privacy
  // review have been deployed and verified. Never auto-enable in a preview.
  return process.env.COMPANION_ANDROID_AUTH_ENABLED === "true"
    && process.env.NODE_ENV === "production";
}
function unit() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, {
    statementTimeoutMs:4000,lockTimeoutMs:1200
  });
}
function scope(name:string) {
  return {platformAccess:true as const,requestId:`companion:${name}`};
}
function sha(value:string) {
  return createHash("sha256").update(value,"utf8").digest("hex");
}
function randomToken() {return randomBytes(32).toString("base64url");}
export function bearerFromRequest(request:Request):string {
  const value=request.headers.get("authorization") ?? "";
  const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  if(!match)throw new Error("UNAUTHORIZED");
  return match[1];
}

export async function issueAuthorizationCode(principal:SessionPrincipal,challenge:string) {
  if(!companionEnabled())throw new Error("NOT_ENABLED");
  if(!validChallenge(challenge)||!principal.roles.includes("customer"))throw new Error("INVALID_REQUEST");
  const code=randomToken();
  await unit().withTransaction(scope("authorize"),async tx=>{
    const r=await tx.query<SqlRow>(`
      INSERT INTO public.companion_authorization_codes
        (code_hash,user_id,code_challenge,client_id,redirect_uri,expires_at)
      SELECT $2,u.id,$3,$4,$5,now()+interval '2 minutes'
      FROM public.users u
      WHERE (u.public_id=$1 OR u.id::text=$1) AND u.status='active'
      RETURNING code_hash
    `,[principal.userId,sha(code),challenge,COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI]);
    if(!r.rows.length)throw new Error("ACCOUNT_NOT_FOUND");
  });
  return code;
}

export async function exchangeAuthorizationCode(code:string,verifier:string):Promise<CompanionTokens>{
  if(!companionEnabled())throw new Error("NOT_ENABLED");
  if(!sessionToken(code)||!/^[A-Za-z0-9_-]{43,128}$/.test(verifier))throw new Error("INVALID_GRANT");
  const challenge=challengeForVerifier(verifier);
  const accessToken=randomToken(),refreshToken=randomToken();
  const now=Date.now();
  return unit().withTransaction(scope("exchange"),async tx=>{
    // One-use authorization code, atomically consumed. Never disclose to another
    // app from a stolen deep link without matching PKCE verifier.
    const rows=await tx.query<SqlRow>(`
      UPDATE public.companion_authorization_codes a
      SET redeemed_at=now()
      FROM public.users u
      WHERE a.code_hash=$1 AND a.code_challenge=$2
        AND a.redeemed_at IS NULL AND a.expires_at>now()
        AND a.client_id=$3 AND a.redirect_uri=$4
        AND u.id=a.user_id AND u.status='active'
      RETURNING a.user_id
    `,[sha(code),challenge,COMPANION_CLIENT_ID,COMPANION_REDIRECT_URI]);
    if(!rows.rows[0])throw new Error("INVALID_GRANT");
    await tx.query(`
      INSERT INTO public.companion_mobile_sessions
      (user_id,access_hash,refresh_hash,access_expires_at,refresh_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,$5,$6)
    `,[rows.rows[0].user_id,sha(accessToken),sha(refreshToken),
      new Date(now+ACCESS_TTL_MS),new Date(now+REFRESH_TTL_MS),new Date(now+ABSOLUTE_TTL_MS)]);
    return {accessToken,refreshToken,tokenType:"Bearer" as const,expiresIn:ACCESS_TTL_MS/1000};
  });
}

export async function requireMobileBearer(request:Request) {
  if(!companionEnabled())throw new Error("NOT_ENABLED");
  const accessToken=bearerFromRequest(request);
  return unit().withTransaction(scope("access"),async tx=>{
    const r=await tx.query<SqlRow>(`
      SELECT s.id::text session_id,u.id::text user_id,u.public_id,u.email::text email
      FROM public.companion_mobile_sessions s JOIN public.users u ON u.id=s.user_id
      WHERE s.access_hash=$1 AND s.revoked_at IS NULL AND s.access_expires_at>now()
        AND s.absolute_expires_at>now() AND u.status='active'
      LIMIT 1
    `,[sha(accessToken)]);
    if(!r.rows[0])throw new Error("UNAUTHORIZED");
    return {sessionId:String(r.rows[0].session_id),userId:String(r.rows[0].user_id),
      publicId:String(r.rows[0].public_id),email:String(r.rows[0].email)};
  },{readOnly:true});
}

export async function rotateMobileSession(token:string):Promise<CompanionTokens>{
  if(!companionEnabled())throw new Error("NOT_ENABLED");
  if(!sessionToken(token))throw new Error("INVALID_GRANT");
  const nextAccess=randomToken(),nextRefresh=randomToken(),now=Date.now();
  return unit().withTransaction(scope("refresh"),async tx=>{
    // SELECT FOR UPDATE serializes rotation across app requests and devices.
    // The previous hash detects a stolen/replayed refresh and revokes the session.
    const r=await tx.query<SqlRow>(`
      SELECT s.id::text,s.refresh_hash,s.previous_refresh_hash,s.absolute_expires_at,
        u.status::text user_status
      FROM public.companion_mobile_sessions s JOIN public.users u ON u.id=s.user_id
      WHERE (s.refresh_hash=$1 OR s.previous_refresh_hash=$1)
        AND s.revoked_at IS NULL AND s.refresh_expires_at>now()
        AND s.absolute_expires_at>now()
      FOR UPDATE OF s
    `,[sha(token)]);
    const row=r.rows[0];
    if(!row || row.user_status!=="active")throw new Error("INVALID_GRANT");
    if(String(row.previous_refresh_hash??"")===sha(token)){
      await tx.query("UPDATE public.companion_mobile_sessions SET revoked_at=now() WHERE id=$1::uuid",[row.id]);
      // Do not throw inside the transaction: revocation must commit.
      return null;
    }
    const absolute=new Date(String(row.absolute_expires_at)).getTime();
    const refreshExpiry=Math.min(now+REFRESH_TTL_MS,absolute);
    await tx.query(`
      UPDATE public.companion_mobile_sessions
      SET previous_refresh_hash=refresh_hash,refresh_hash=$2,access_hash=$3,
        refresh_expires_at=$4,access_expires_at=$5,rotated_at=now()
      WHERE id=$1::uuid
    `,[row.id,sha(nextRefresh),sha(nextAccess),new Date(refreshExpiry),new Date(now+ACCESS_TTL_MS)]);
    return {accessToken:nextAccess,refreshToken:nextRefresh,tokenType:"Bearer" as const,expiresIn:ACCESS_TTL_MS/1000};
  }).then(value=>{
    if(!value)throw new Error("REFRESH_REPLAY");
    return value;
  });
}

export async function revokeMobileSession(refreshToken:string) {
  if(!companionEnabled())throw new Error("NOT_ENABLED");
  if(!sessionToken(refreshToken))return;
  await unit().withTransaction(scope("revoke"),async tx=>{
    await tx.query(`
      UPDATE public.companion_mobile_sessions SET revoked_at=now()
      WHERE (refresh_hash=$1 OR previous_refresh_hash=$1) AND revoked_at IS NULL
    `,[sha(refreshToken)]);
  });
}

export async function mobileAccountSnapshot(userId:string) {
  if(!companionEnabled())throw new Error("NOT_ENABLED");
  return unit().withTransaction(scope("snapshot"),async tx=>{
    const user=await tx.query<SqlRow>("SELECT public_id,email::text FROM public.users WHERE id=$1::uuid AND status='active'",[userId]);
    if(!user.rows[0])throw new Error("UNAUTHORIZED");
    const orders=await tx.query<SqlRow>(`
      SELECT o.public_id AS id,o.order_number AS reference,
        o.status::text AS status,o.total_minor AS total_minor,
        o.currency,o.created_at,
        EXISTS(
          SELECT 1 FROM public.fulfilment_orders fo WHERE fo.order_id=o.id AND fo.mode='pickup'
        ) AS has_pickup,
        EXISTS(
          SELECT 1 FROM public.fulfilment_orders fo
          JOIN public.pickup_groups pg ON pg.fulfilment_order_id=fo.id
          WHERE fo.order_id=o.id AND pg.ready_at IS NOT NULL AND pg.collected_at IS NULL
        ) AS pickup_ready
      FROM public.customer_orders o
      WHERE o.user_id=$1::uuid
      ORDER BY o.created_at DESC
      LIMIT 25
    `,[userId]);
    const saved=await tx.query<SqlRow>(`
      SELECT sp.public_id AS id,cv.public_id AS variant_id,cv.slug,
        COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),cv.model,cv.slug) AS title
      FROM public.saved_products sp
      JOIN public.canonical_variants cv ON cv.id=sp.canonical_variant_id
      LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE sp.user_id=$1::uuid
      ORDER BY sp.saved_at DESC LIMIT 80
    `,[userId]);
    return {
      account:{email:String(user.rows[0].email),id:String(user.rows[0].public_id)},
      orders:orders.rows.map(o=>({
        id:String(o.id),reference:String(o.reference),status:String(o.status),
        totalMinor:Number(o.total_minor??0),currency:String(o.currency??"EUR").trim(),
        createdAt:String(o.created_at),hasPickup:o.has_pickup===true,pickupReady:o.pickup_ready===true
      })),
      savedProducts:saved.rows.map(v=>({
        id:String(v.id),variantId:String(v.variant_id),title:String(v.title),
        slug:String(v.slug??"")
      }))
    };
  },{readOnly:true});
}

/** Web-account owner can inspect and revoke their Android sessions independently. */
export async function customerCompanionSessions(principal:SessionPrincipal){
 if(!companionEnabled())return [];
 return unit().withTransaction(scope("list-devices"),async tx=>{
  const q=await tx.query<SqlRow>(`
    SELECT s.id::text AS id,s.created_at,s.rotated_at,s.refresh_expires_at
      FROM public.companion_mobile_sessions s
      JOIN public.users u ON u.id=s.user_id
      WHERE (u.public_id=$1 OR u.id::text=$1)
        AND s.revoked_at IS NULL AND s.absolute_expires_at>now()
        AND s.refresh_expires_at>now() AND u.status='active'
      ORDER BY s.created_at DESC LIMIT 50
  `,[principal.userId]);
  return q.rows.map(r=>({id:String(r.id),createdAt:String(r.created_at),
    lastUsedAt:String(r.rotated_at),expiresAt:String(r.refresh_expires_at)}));
 },{readOnly:true});
}
export async function customerRevokeCompanionSession(principal:SessionPrincipal,id:string){
 if(!companionEnabled())throw new Error("NOT_ENABLED");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
   throw new Error("INVALID_REQUEST");
 await unit().withTransaction(scope("revoke-device"),async tx=>{
   await tx.query(`
      UPDATE public.companion_mobile_sessions s SET revoked_at=now()
      FROM public.users u
      WHERE s.id=$2::uuid AND s.user_id=u.id AND (u.public_id=$1 OR u.id::text=$1)
        AND s.revoked_at IS NULL AND u.status='active'
   `,[principal.userId,id]);
 });
}

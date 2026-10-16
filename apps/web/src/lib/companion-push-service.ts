import {createHash,createCipheriv,createDecipheriv,createSign,randomBytes} from "node:crypto";
import {PostgresUnitOfWork,type SqlRow} from "@buy-local-sparta/core";
import {getProductionPostgresRuntime} from "./postgres-runtime";
import {allowCompanionPush,allowCompanionTestPush,parsePushConsent,validFcmToken,
  PUSH_CONSENT_VERSION,type CompanionPushConsent} from "./companion-push-policy";

export type CompanionDevicePrincipal={userId:string;sessionId:string};
const scope=(name:string)=>({platformAccess:true as const,requestId:`companion-push:${name}`});
function unit(){return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool,{
  statementTimeoutMs:4000,lockTimeoutMs:1000
});}
function sha(token:string){return createHash("sha256").update(token).digest("hex");}
function encryptionKey():Buffer{
 const key=process.env.COMPANION_FCM_TOKEN_ENCRYPTION_KEY;
 if(!key||!/^([A-Za-z0-9+/]{43}=|[A-Za-z0-9_-]{43})$/.test(key))throw Error("PUSH_NOT_CONFIGURED");
 const decoded=Buffer.from(key.replace(/-/g,"+").replace(/_/g,"/"),"base64");
 if(decoded.length!==32)throw Error("PUSH_NOT_CONFIGURED");
 return decoded;
}
function encrypt(token:string):string{
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
 const encrypted=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
function decrypt(ciphertext:string):string{
 const [iv,tag,data]=ciphertext.split(".");
 if(!iv||!tag||!data)throw Error("CORRUPT_DEVICE_TOKEN");
 const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 const plain=Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");
 if(!validFcmToken(plain))throw Error("CORRUPT_DEVICE_TOKEN");
 return plain;
}
export function pushRegistrationEnabled(){
 return allowCompanionPush(process.env) && Boolean(process.env.COMPANION_FCM_TOKEN_ENCRYPTION_KEY);
}
function requirePush(){if(!pushRegistrationEnabled())throw Error("PUSH_NOT_ENABLED");}
async function writeConsent(tx:{query:<T extends SqlRow=SqlRow>(sql:string,params?:unknown[])=>Promise<{rows:T[]}>},
  p:CompanionDevicePrincipal,purposes:CompanionPushConsent,action:"register"|"update"|"disable"){
 await tx.query(`
   INSERT INTO public.companion_push_consent_events
     (user_id,session_id,order_updates_enabled,saved_items_enabled,vendor_offers_enabled,action,consent_version)
   VALUES($1::uuid,$2::uuid,$3,$4,false,$5,$6)
 `,[p.userId,p.sessionId,purposes.orderUpdates,purposes.savedItems,action,PUSH_CONSENT_VERSION]);
}
export async function enrollCompanionDevice(p:CompanionDevicePrincipal,token:unknown,input:unknown){
 requirePush();
 if(!validFcmToken(token))throw Error("INVALID_DEVICE_TOKEN");
 const purposes=parsePushConsent(input);
 const ciphertext=encrypt(token);
 const fingerprint=sha(token);
 return unit().withTransaction(scope("enroll"),async tx=>{
  const old=await tx.query<SqlRow>(`
    SELECT id::text AS id FROM public.companion_push_devices
    WHERE session_id=$1::uuid AND user_id=$2::uuid FOR UPDATE
  `,[p.sessionId,p.userId]);
  // Do not take over a token already registered by another customer's login.
  const occupied=await tx.query<SqlRow>(`
    SELECT user_id::text AS user_id FROM public.companion_push_devices
    WHERE token_hash=$1 FOR UPDATE
  `,[fingerprint]);
  if(occupied.rows.some(r=>r.user_id!==p.userId))throw Error("TOKEN_ALREADY_REGISTERED");
  // Allows same customer to re-authenticate without stale device token collisions.
  await tx.query(`DELETE FROM public.companion_push_devices
    WHERE token_hash=$1 AND user_id=$2::uuid AND session_id<>$3::uuid`,
    [fingerprint,p.userId,p.sessionId]);
  const result=await tx.query<SqlRow>(`
    INSERT INTO public.companion_push_devices
      (user_id,session_id,token_hash,token_encrypted,order_updates_enabled,
       saved_items_enabled,vendor_offers_enabled,consent_version,consented_at)
    SELECT $1::uuid,s.id,$3,$4,$5,$6,false,$7,now()
    FROM public.companion_mobile_sessions s
    WHERE s.id=$2::uuid AND s.user_id=$1::uuid AND s.revoked_at IS NULL
      AND s.absolute_expires_at>now()
    ON CONFLICT(session_id) DO UPDATE SET
      token_hash=EXCLUDED.token_hash,token_encrypted=EXCLUDED.token_encrypted,
      order_updates_enabled=EXCLUDED.order_updates_enabled,
      saved_items_enabled=EXCLUDED.saved_items_enabled,vendor_offers_enabled=false,
      consent_version=EXCLUDED.consent_version,consented_at=now(),
      disabled_at=NULL,last_registered_at=now()
    WHERE public.companion_push_devices.user_id=EXCLUDED.user_id
    RETURNING id::text
  `,[p.userId,p.sessionId,fingerprint,ciphertext,purposes.orderUpdates,
    purposes.savedItems,PUSH_CONSENT_VERSION]);
  if(!result.rows[0])throw Error("UNAUTHORIZED");
  await writeConsent(tx,p,purposes,old.rows.length?"update":"register");
  return {enabled:true,orderUpdates:purposes.orderUpdates,savedItems:purposes.savedItems,
    vendorOffers:false};
 });
}
export async function companionDeviceStatus(p:CompanionDevicePrincipal){
 requirePush();
 return unit().withTransaction(scope("read-consent"),async tx=>{
  const result=await tx.query<SqlRow>(`
    SELECT order_updates_enabled,saved_items_enabled
    FROM public.companion_push_devices
    WHERE session_id=$1::uuid AND user_id=$2::uuid AND disabled_at IS NULL
    LIMIT 1
  `,[p.sessionId,p.userId]);
  const r=result.rows[0];
  return {enabled:Boolean(r),orderUpdates:r?.order_updates_enabled===true,
    savedItems:r?.saved_items_enabled===true,vendorOffers:false};
 },{readOnly:true});
}
export async function disableCompanionDevice(p:CompanionDevicePrincipal){
 requirePush();
 return unit().withTransaction(scope("disable"),async tx=>{
  const existing=await tx.query<SqlRow>(`
   UPDATE public.companion_push_devices SET disabled_at=now(),
     order_updates_enabled=false,saved_items_enabled=false,vendor_offers_enabled=false
   WHERE session_id=$1::uuid AND user_id=$2::uuid AND disabled_at IS NULL
   RETURNING id
  `,[p.sessionId,p.userId]);
  if(existing.rows.length)await writeConsent(tx,p,{
    orderUpdates:false,savedItems:false,vendorOffers:false},"disable");
  return {enabled:false,orderUpdates:false,savedItems:false,vendorOffers:false};
 });
}
type ServiceCredentials={project_id:string;client_email:string;private_key:string};
function serviceAccount():ServiceCredentials{
 const raw=process.env.COMPANION_FCM_SERVICE_ACCOUNT_JSON;
 if(!raw)throw Error("FCM_NOT_CONFIGURED");
 const value=JSON.parse(raw) as Partial<ServiceCredentials>;
 if(typeof value.project_id!=="string"||!/^[a-z0-9-]{5,100}$/.test(value.project_id)
 ||typeof value.client_email!=="string"
 ||!value.client_email.endsWith(".gserviceaccount.com")
 ||typeof value.private_key!=="string"||!value.private_key.includes("BEGIN PRIVATE KEY"))
 throw Error("FCM_NOT_CONFIGURED");
 return value as ServiceCredentials;
}
function base64url(o:object){return Buffer.from(JSON.stringify(o)).toString("base64url");}
async function firebaseAccessToken(credentials:ServiceCredentials){
 const now=Math.floor(Date.now()/1000);
 const header=base64url({alg:"RS256",typ:"JWT"});
 const claims=base64url({iss:credentials.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging",
  aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+600});
 const input=header+"."+claims;
 const signer=createSign("RSA-SHA256");signer.update(input);signer.end();
 const jwt=input+"."+signer.sign(credentials.private_key).toString("base64url");
 const response=await fetch("https://oauth2.googleapis.com/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt}),
  signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error("FCM_AUTH_FAILED");
 const result=await response.json() as {access_token?:string};
 if(!result.access_token)throw Error("FCM_AUTH_FAILED");
 return result.access_token;
}
/** Only a user-triggered test message, never a vendor-generated marketing send. */
export async function testCompanionPush(p:CompanionDevicePrincipal){
 requirePush();
 if(!allowCompanionTestPush(process.env))throw Error("TEST_DISABLED");
 const credentials=serviceAccount();
 const reserved=await unit().withTransaction(scope("reserve-self-test"),async tx=>{
   const devices=await tx.query<SqlRow>(`
     SELECT d.id::text AS id,d.token_encrypted
     FROM public.companion_push_devices d
     JOIN public.companion_mobile_sessions s ON s.id=d.session_id
     WHERE d.session_id=$1::uuid AND d.user_id=$2::uuid
       AND d.disabled_at IS NULL AND (d.order_updates_enabled OR d.saved_items_enabled)
       AND s.revoked_at IS NULL AND s.absolute_expires_at>now()
     FOR UPDATE OF d
   `,[p.sessionId,p.userId]);
   const device=devices.rows[0];
   if(!device)throw Error("NOT_REGISTERED");
   const result=await tx.query<SqlRow>(`
     INSERT INTO public.companion_push_test_log(user_id,device_id)
     SELECT $1::uuid,$2::uuid WHERE NOT EXISTS (
       SELECT 1 FROM public.companion_push_test_log
       WHERE device_id=$2::uuid AND requested_at>now()-interval '24 hours'
     ) RETURNING id::text
   `,[p.userId,String(device.id)]);
   if(!result.rows[0])throw Error("TEST_RATE_LIMITED");
   return {id:String(result.rows[0].id),token:String(device.token_encrypted)};
 });
 let providerId="";
 try{
  const fcmToken=decrypt(reserved.token);
  const oauth=await firebaseAccessToken(credentials);
  const r=await fetch(`https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,{
    method:"POST",headers:{"Authorization":`Bearer ${oauth}`,"Content-Type":"application/json"},
    body:JSON.stringify({message:{token:fcmToken,
      notification:{title:"KONTA MOY Companion",body:"Η δοκιμαστική ειδοποίηση Android λειτουργεί."},
      android:{priority:"NORMAL",notification:{channel_id:"companion-updates"}},
      data:{kind:"self_test"}}}),
    signal:AbortSignal.timeout(8000)
  });
  if(!r.ok)throw Error("FCM_DELIVERY_FAILED");
  const payload=await r.json() as {name?:string};
  providerId=typeof payload.name==="string"?payload.name.slice(0,512):"";
 }catch{
  await unit().withTransaction(scope("test-failed"),tx=>tx.query(
    "UPDATE public.companion_push_test_log SET status='failed' WHERE id=$1::uuid AND user_id=$2::uuid",
    [reserved.id,p.userId]));
  throw Error("FCM_TEST_FAILED");
 }
 await unit().withTransaction(scope("test-submitted"),tx=>tx.query(
   "UPDATE public.companion_push_test_log SET status='submitted',provider_message_id=$3 WHERE id=$1::uuid AND user_id=$2::uuid",
   [reserved.id,p.userId,providerId]));
 return {submitted:true};
}

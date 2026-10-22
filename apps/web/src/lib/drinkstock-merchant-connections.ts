import {createHash,randomBytes} from "node:crypto";
import {AadeMyDataClient} from "@buy-local-sparta/aade-mydata";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {MerchantConnectionError} from "./drinkstock-merchant-connection-error";
export {MerchantConnectionError} from "./drinkstock-merchant-connection-error";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MOLLIE_CONNECT_SCOPES="organizations.read profiles.read onboarding.read payments.read payments.write refunds.read refunds.write";
function pool(){if(!productionDatabaseConfigured())throw new MerchantConnectionError("DATABASE_UNAVAILABLE",503);return getProductionPostgresRuntime().sqlPool;}
function hash(x:string){return createHash("sha256").update(x).digest("hex");}
export async function merchantOwner(userId:string,partnerId:string){
 if(!uuid.test(partnerId)||!userId)throw new MerchantConnectionError("NOT_FOUND",404);
 const r=await pool().query<{role:string}>(
 "SELECT m.role FROM public.hospitality_partner_memberships m JOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active' JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled WHERE m.partner_id=$1::uuid AND m.user_id=$2 AND m.status='active'",[partnerId,userId]);
 if(!r.rows[0])throw new MerchantConnectionError("NOT_FOUND",404);
 if(r.rows[0].role!=="owner")throw new MerchantConnectionError("OWNER_REQUIRED",403);
}
function config(){
 const clientId=process.env.DRINKSTOCK_MOLLIE_CONNECT_CLIENT_ID?.trim();
 const secret=process.env.DRINKSTOCK_MOLLIE_CONNECT_CLIENT_SECRET?.trim();
 const callback=process.env.DRINKSTOCK_MOLLIE_OAUTH_REDIRECT_URI?.trim();
 if(!clientId||!/^app_[A-Za-z0-9]+$/.test(clientId)||!secret||!callback)
  throw new MerchantConnectionError("MOLLIE_CONNECT_APP_NOT_CONFIGURED",503);
 let url:URL;try{url=new URL(callback);}catch{throw new MerchantConnectionError("INVALID_OAUTH_CALLBACK",503);}
 if(url.protocol!=="https:"||url.hostname!=="hospitality.kontamou.site"||
    url.pathname!=="/api/hospitality/mollie/callback"||url.port||url.search||url.hash||url.username||url.password)
  throw new MerchantConnectionError("INVALID_OAUTH_CALLBACK",503);
 return {clientId,secret,callback};
}
export function mollieConnectConfigured(){try{config();return true;}catch{return false;}}
export function merchantMollieAuthorizationUrl(clientId:string,callback:string,state:string){
 if(!/^app_[A-Za-z0-9]+$/.test(clientId)||!/^[A-Za-z0-9_-]{43}$/.test(state))
  throw new MerchantConnectionError("INVALID_OAUTH_STATE");
 const url=new URL("https://my.mollie.com/oauth2/authorize");
 for(const [key,value] of Object.entries({client_id:clientId,redirect_uri:callback,state,scope:MOLLIE_CONNECT_SCOPES,response_type:"code"}))
  url.searchParams.set(key,value);
 return url.toString();
}
export async function beginMerchantMollieConnect(userId:string,partnerId:string){
 await merchantOwner(userId,partnerId);const cfg=config();
 const state=randomBytes(32).toString("base64url");
 await pool().query("INSERT INTO public.drinkstock_mollie_oauth_states(partner_id,actor_user_id,state_sha256,expires_at) VALUES($1::uuid,$2,$3,now()+interval '10 minutes')",[partnerId,userId,hash(state)]);
 return merchantMollieAuthorizationUrl(cfg.clientId,cfg.callback,state);
}
type MollieTokens={access_token:string;refresh_token:string;token_type:string;scope:string};
async function exchange(grant:Record<string,string>):Promise<MollieTokens>{
 const cfg=config();let r:Response;
 try{r=await fetch("https://api.mollie.com/oauth2/tokens",{method:"POST",signal:AbortSignal.timeout(12000),
  headers:{authorization:"Basic "+Buffer.from(cfg.clientId+":"+cfg.secret).toString("base64"),"content-type":"application/x-www-form-urlencoded",accept:"application/json"},
  body:new URLSearchParams(grant)});}catch{throw new MerchantConnectionError("MOLLIE_CONNECTION_UNAVAILABLE",503);}
 if(!r.ok)throw new MerchantConnectionError("MOLLIE_AUTHORIZATION_REJECTED",502);
 const t=await r.json() as MollieTokens;
 if(typeof t.access_token!=="string"||t.access_token.length<16||
    typeof t.refresh_token!=="string"||t.refresh_token.length<16||
    t.token_type?.toLowerCase()!=="bearer"||typeof t.scope!=="string"||
    !MOLLIE_CONNECT_SCOPES.split(" ").every(x=>t.scope.split(" ").includes(x)))
  throw new MerchantConnectionError("MOLLIE_OAUTH_SCOPE_OR_TOKEN_INVALID",403);
 return t;
}
async function get<T>(token:string,path:string):Promise<T>{
 if(!/^\/v2\/[a-zA-Z0-9/?&=_-]+$/.test(path)||path.includes(".."))throw new MerchantConnectionError("INVALID_MOLLIE_PATH");
 let r:Response;try{r=await fetch("https://api.mollie.com"+path,{signal:AbortSignal.timeout(12000),
  headers:{authorization:"Bearer "+token,accept:"application/json"}});}catch{throw new MerchantConnectionError("MOLLIE_CONNECTION_UNAVAILABLE",503);}
 if(!r.ok)throw new MerchantConnectionError("MOLLIE_CAPABILITIES_UNAVAILABLE",502);
 return r.json() as Promise<T>;
}
export function inspectMollieMerchant(input:{id:string;profiles:{id:string;status:string}[];
 capabilities:{name:string;status:string}[]}){
 if(!/^org_[A-Za-z0-9]+$/.test(input.id))throw new MerchantConnectionError("INVALID_MERCHANT_ORGANIZATION",502);
 const approved=input.profiles.filter(p=>/^pfl_[A-Za-z0-9]+$/.test(p.id)&&["verified","active"].includes(p.status));
 const capability=(name:string)=>input.capabilities.find(c=>c.name===name)?.status??"unverified";
 const profile=approved.length===1?approved[0]!.id:null;
 const payments=capability("payments"),settlements=capability("settlements");
 return {organizationId:input.id,profileId:profile,payments,settlements,
  operational:profile!==null&&payments==="enabled"&&settlements==="enabled"};
}
async function probe(token:string){
 const [o,p,c]=await Promise.all([get<{id:string}>(token,"/v2/organizations/me"),
 get<{_embedded?:{profiles?:{id:string;status:string}[]}}>(token,"/v2/profiles?limit=100"),
 get<{_embedded?:{capabilities?:{name:string;status:string}[]}}>(token,"/v2/capabilities")]);
 return inspectMollieMerchant({id:o.id,profiles:p._embedded?.profiles??[],capabilities:c._embedded?.capabilities??[]});
}
export async function completeMerchantMollieConnect(userId:string,state:string,code:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^auth_[A-Za-z0-9]+$/.test(code))
  throw new MerchantConnectionError("INVALID_OAUTH_RETURN");
 const c=await pool().connect();let done=false;
 try{
 await c.query("BEGIN");await c.query("SET LOCAL statement_timeout='27s'");
 const r=await c.query<{partner_id:string;actor_user_id:string}>(
 "SELECT partner_id::text,actor_user_id FROM public.drinkstock_mollie_oauth_states WHERE state_sha256=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[hash(state)]);
 const s=r.rows[0];if(!s||s.actor_user_id!==userId)throw new MerchantConnectionError("OAUTH_STATE_EXPIRED",403);
 await merchantOwner(userId,s.partner_id);
 const t=await exchange({grant_type:"authorization_code",code,redirect_uri:config().callback});
 const info=await probe(t.access_token);
 const old=await c.query<{mollie_organization_id:string;refresh_secret_id:string}>(
 "SELECT mollie_organization_id,refresh_secret_id::text FROM public.drinkstock_mollie_merchant_connections WHERE partner_id=$1::uuid FOR UPDATE",[s.partner_id]);
 if(old.rows[0]&&old.rows[0].mollie_organization_id!==info.organizationId)
  throw new MerchantConnectionError("MERCHANT_ACCOUNT_SWITCH_REQUIRES_REVIEW",409);
 let secretId=old.rows[0]?.refresh_secret_id;
 if(secretId)await c.query("SELECT vault.update_secret($1::uuid,$2,NULL,NULL,NULL)",[secretId,t.refresh_token]);
 else{
  const vault=await c.query<{id:string}>("SELECT vault.create_secret($1,$2,$3,NULL) AS id",
   [t.refresh_token,"drinkstock_mollie_refresh_"+s.partner_id,"DrinkStock partner-owned Mollie refresh token"]);
  secretId=vault.rows[0]?.id;
 }
 if(!secretId)throw new MerchantConnectionError("VAULT_STORAGE_UNAVAILABLE",503);
 await c.query("INSERT INTO public.drinkstock_mollie_merchant_connections(partner_id,mollie_organization_id,mollie_profile_id,refresh_secret_id,scopes,payments_capability,settlements_capability,verified_at) VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7,now()) ON CONFLICT(partner_id) DO UPDATE SET mollie_profile_id=EXCLUDED.mollie_profile_id,refresh_secret_id=EXCLUDED.refresh_secret_id,scopes=EXCLUDED.scopes,payments_capability=EXCLUDED.payments_capability,settlements_capability=EXCLUDED.settlements_capability,verified_at=now(),disabled_at=NULL",
  [s.partner_id,info.organizationId,info.profileId,secretId,t.scope,info.payments,info.settlements]);
 await c.query("UPDATE public.drinkstock_mollie_oauth_states SET consumed_at=now() WHERE state_sha256=$1",[hash(state)]);
 await c.query("COMMIT");done=true;
 return {partnerId:s.partner_id,connected:true,merchantOperational:info.operational};
 }catch(e){if(!done)try{await c.query("ROLLBACK");}catch{}throw e;}finally{c.release();}
}
export async function merchantConnectionsStatus(userId:string,partnerId:string){
 await merchantOwner(userId,partnerId);
 const [m,a]=await Promise.all([
 pool().query<{mollie_organization_id:string;mollie_profile_id:string|null;payments_capability:string;settlements_capability:string;disabled_at:Date|null}>(
  "SELECT mollie_organization_id,mollie_profile_id,payments_capability,settlements_capability,disabled_at FROM public.drinkstock_mollie_merchant_connections WHERE partner_id=$1::uuid",[partnerId]),
 pool().query<{issuer_vat_number:string;aade_environment:string;connectivity_state:string;fiscal_issuance_route:string;receipt_issuance_verified:boolean}>(
  "SELECT issuer_vat_number,aade_environment,connectivity_state,fiscal_issuance_route,receipt_issuance_verified FROM public.drinkstock_merchant_aade_connections WHERE partner_id=$1::uuid",[partnerId])]);
 const x=m.rows[0],y=a.rows[0];
 return {partnerId,mollie:{appConfigured:mollieConnectConfigured(),connected:Boolean(x&&!x.disabled_at),
   organizationId:x?.mollie_organization_id??null,profileSelected:Boolean(x?.mollie_profile_id),
   paymentsCapability:x?.payments_capability??"not_connected",settlementsCapability:x?.settlements_capability??"not_connected"},
 aade:{connected:Boolean(y),issuerVatNumber:y?.issuer_vat_number??null,environment:y?.aade_environment??null,
  connectivityState:y?.connectivity_state??"not_connected",fiscalIssuanceRoute:y?.fiscal_issuance_route??"unverified",
  receiptIssuanceVerified:y?.receipt_issuance_verified===true},guestPaymentsEnabled:false as const};
}
export function validGreekTaxNumber(value:string){
 if(!/^\d{9}$/.test(value)||value==="000000000")return false;
 const total=[256,128,64,32,16,8,4,2].reduce((sum,factor,i)=>sum+Number(value[i])*factor,0);
 return (total%11)%10===Number(value[8]);
}
export async function connectMerchantAade(userId:string,partnerId:string,raw:unknown){
 await merchantOwner(userId,partnerId);
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new MerchantConnectionError("INVALID_AADE_SETTINGS");
 const x=raw as Record<string,unknown>;
 if(Object.keys(x).sort().join(",")!=="environment,issuerVatNumber,subscriptionKey,userId"||
    typeof x.issuerVatNumber!=="string"||!validGreekTaxNumber(x.issuerVatNumber)||
    typeof x.userId!=="string"||x.userId.trim().length<3||x.userId.length>150||
    typeof x.subscriptionKey!=="string"||x.subscriptionKey.length<12||x.subscriptionKey.length>250||
    !["test","production"].includes(String(x.environment)))
  throw new MerchantConnectionError("INVALID_AADE_SETTINGS");
 const taxId=x.issuerVatNumber,usr=x.userId.trim(),key=x.subscriptionKey,env=x.environment as "test"|"production";
 let verified=false;
 try{
  const client=new AadeMyDataClient({environment:env,baseUrl:env==="production"?
   "https://mydatapi.aade.gr/myDATA":"https://mydataapidev.aade.gr",
   userId:usr,subscriptionKey:key,requestTimeoutMs:12000,specVersion:"2.0.2"});
  const date=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date());
  // One-day read-only probe avoids downloading the merchant's entire sales archive.
  await client.requestTransmittedDocs({mark:"0",entityVatNumber:taxId,dateFrom:date,dateTo:date});
  verified=true;
 }catch{/* Connection failure is recorded; never imply fiscal issuance */}
 const c=await pool().connect();let done=false;
 try{
  await c.query("BEGIN");await c.query("SET LOCAL statement_timeout='8s'");
  const old=await c.query<{user_secret_id:string;subscription_secret_id:string}>(
   "SELECT user_secret_id::text,subscription_secret_id::text FROM public.drinkstock_merchant_aade_connections WHERE partner_id=$1::uuid FOR UPDATE",[partnerId]);
  const vault=async (secret:string,id:string|undefined,name:string)=>{
   if(id){await c.query("SELECT vault.update_secret($1::uuid,$2,NULL,NULL,NULL)",[id,secret]);return id;}
   const r=await c.query<{id:string}>("SELECT vault.create_secret($1,$2,$3,NULL) AS id",
    [secret,name,"DrinkStock merchant AADE reporting credential"]);
   if(!r.rows[0])throw new MerchantConnectionError("VAULT_STORAGE_UNAVAILABLE",503);
   return r.rows[0].id;
  };
  const u=await vault(usr,old.rows[0]?.user_secret_id,"drinkstock_aade_user_"+partnerId);
  const k=await vault(key,old.rows[0]?.subscription_secret_id,"drinkstock_aade_key_"+partnerId);
  await c.query("INSERT INTO public.drinkstock_merchant_aade_connections(partner_id,issuer_vat_number,aade_environment,user_secret_id,subscription_secret_id,connectivity_state,connectivity_checked_at) VALUES($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,now()) ON CONFLICT(partner_id) DO UPDATE SET issuer_vat_number=EXCLUDED.issuer_vat_number,aade_environment=EXCLUDED.aade_environment,user_secret_id=EXCLUDED.user_secret_id,subscription_secret_id=EXCLUDED.subscription_secret_id,connectivity_state=EXCLUDED.connectivity_state,connectivity_checked_at=now(),receipt_issuance_verified=false,fiscal_issuance_route='unverified',updated_at=now()",
   [partnerId,taxId,env,u,k,verified?"verified":"failed"]);
  await c.query("COMMIT");done=true;
  return {configured:true,connectivityVerified:verified,environment:env,
   message:verified?"AADE reporting connected; legal retail receipt issuance still unverified":
    "AADE credentials stored, but reporting connectivity is not yet verified"};
 }catch(e){if(!done)try{await c.query("ROLLBACK");}catch{}throw e;}finally{c.release();}
}

/**
 * Internal ONLY: obtains a short-lived OAuth access token for the connected
 * hospitality merchant after re-checking live Mollie capabilities. The refresh
 * token remains in Supabase Vault; update is serialized per merchant.
 * Do not expose this function in any public/table API route.
 */
export async function merchantMollieServerToken(partnerId:string){
 if(!uuid.test(partnerId))throw new MerchantConnectionError("NOT_FOUND",404);
 const c=await pool().connect();let done=false;
 try{
  await c.query("BEGIN");await c.query("SET LOCAL statement_timeout='27s'");
  const found=await c.query<{mollie_organization_id:string;mollie_profile_id:string|null;refresh_secret_id:string;disabled_at:Date|null}>(
   "SELECT mollie_organization_id,mollie_profile_id,refresh_secret_id::text,disabled_at FROM public.drinkstock_mollie_merchant_connections WHERE partner_id=$1::uuid FOR UPDATE",[partnerId]);
  const saved=found.rows[0];
  if(!saved||saved.disabled_at||!saved.mollie_profile_id)
   throw new MerchantConnectionError("MOLLIE_MERCHANT_NOT_READY",409);
  const token=await c.query<{decrypted_secret:string}>(
   "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id=$1::uuid",[saved.refresh_secret_id]);
  const oldRefresh=token.rows[0]?.decrypted_secret;
  if(!oldRefresh||!oldRefresh.startsWith("refresh_"))
   throw new MerchantConnectionError("MOLLIE_MERCHANT_AUTH_MISSING",503);
  const refreshed=await exchange({grant_type:"refresh_token",refresh_token:oldRefresh});
  const live=await probe(refreshed.access_token);
  if(live.organizationId!==saved.mollie_organization_id||!live.operational||
     live.profileId!==saved.mollie_profile_id)
   throw new MerchantConnectionError("MOLLIE_MERCHANT_CAPABILITIES_CHANGED",409);
  await c.query("SELECT vault.update_secret($1::uuid,$2,NULL,NULL,NULL)",
   [saved.refresh_secret_id,refreshed.refresh_token]);
  await c.query("UPDATE public.drinkstock_mollie_merchant_connections SET scopes=$2,payments_capability=$3,settlements_capability=$4,verified_at=now() WHERE partner_id=$1::uuid",
   [partnerId,refreshed.scope,live.payments,live.settlements]);
  await c.query("COMMIT");done=true;
  return {accessToken:refreshed.access_token,organizationId:live.organizationId,profileId:live.profileId};
 }catch(e){if(!done)try{await c.query("ROLLBACK");}catch{}throw e;}finally{c.release();}
}


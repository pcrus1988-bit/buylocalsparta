/**
 * M43 — READ-ONLY public OIDC/JWKS compatibility probe for a PINNED,
 * KONTA MOY-controlled issuer. No token is minted, no signing key or
 * merchant document is requested, and nothing is registered in Supabase.
 *
 * A matching public JWKS key DOES NOT prove Supabase has enabled Third-Party
 * Auth, mapped the database role or prevented bearer-token replay.
 * Production intake and fiscal issuance remain disabled, without switches.
 */
import {createPublicKey} from "node:crypto";

type Reader=(url:string,options:RequestInit)=>Promise<Response>;
type Json=Record<string,unknown>;
export type FiscalM43PublicTrust=Readonly<{
 issuer:string;keyId:string;publicKeyPem:string;
}>;
export type FiscalM43Status=Readonly<{
 status:"not_configured"|"invalid_pin"|"unavailable"|"provider_mismatch"|"public_jwks_verified";
 pinnedPublicKeyMatched:boolean;
 oidcDiscoveryVerified:boolean;
 externalIssuerRegisteredWithSupabase:false;
 customRoleMappedToAuthenticator:false;
 downstreamReplayProtectionVerified:false;
 storagePolicyActivated:false;
 merchantUploadsEnabled:false;
 fiscalIssuanceEnabled:false;
}>;

const failed=(status:FiscalM43Status["status"]):FiscalM43Status=>
 Object.freeze({
  status,pinnedPublicKeyMatched:false,oidcDiscoveryVerified:false,
  externalIssuerRegisteredWithSupabase:false as const,
  customRoleMappedToAuthenticator:false as const,
  downstreamReplayProtectionVerified:false as const,
  storagePolicyActivated:false as const,merchantUploadsEnabled:false as const,
  fiscalIssuanceEnabled:false as const
 });
const MAX_JSON=32*1024;

/** Only an explicitly pinned same-company HTTPS issuer. Not user input. */
function validIssuer(issuer:unknown):issuer is string{
 if(typeof issuer!=="string"||issuer.length>200||
    !/^https:\/\/[a-z0-9.-]+$/.test(issuer))return false;
 const host=issuer.slice(8);
 if(host!=="kontamou.site"&&!host.endsWith(".kontamou.site"))return false;
 const labels=host.split(".");
 return labels.every(label=>label.length>0&&label.length<=63&&
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
function strictPublicKey(pin:FiscalM43PublicTrust){
 if(!pin||!validIssuer(pin.issuer)||
  typeof pin.keyId!=="string"||
  !/^[A-Za-z0-9_-]{8,80}$/.test(pin.keyId)||
  typeof pin.publicKeyPem!=="string"||
  !pin.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")||
  pin.publicKeyPem.length>8192)return null;
 try{
  const key=createPublicKey(pin.publicKeyPem);
  if(key.asymmetricKeyType!=="rsa"||
     (key.asymmetricKeyDetails?.modulusLength??0)<3072)return null;
  const publicJwk=key.export({format:"jwk"}) as Json;
  if(typeof publicJwk.n!=="string"||typeof publicJwk.e!=="string")return null;
  return {n:publicJwk.n,e:publicJwk.e};
 }catch{return null;}
}
function plainObject(value:unknown):value is Json{
 return Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
}
async function readJson(request:Reader,url:string):Promise<Json>{
 const response=await request(url,{
  method:"GET",redirect:"manual",cache:"no-store",
  signal:AbortSignal.timeout(4000),headers:{accept:"application/json"}
 });
 if(response.status!==200||response.redirected)return Promise.reject(Error("M43_UNAVAILABLE"));
 const ct=response.headers.get("content-type")??"";
 if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(ct))
  throw Error("M43_INVALID_JSON_TYPE");
 const len=response.headers.get("content-length");
 if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_JSON))
  throw Error("M43_OVERSIZE");
 if(!response.body)throw Error("M43_EMPTY");
 const reader=response.body.getReader();
 const parts:Uint8Array[]=[];
 let total=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   total+=part.value.byteLength;
   if(total>MAX_JSON)throw Error("M43_OVERSIZE");
   parts.push(part.value);
  }
 }finally{reader.releaseLock();}
 const json=JSON.parse(Buffer.concat(parts.map(b=>Buffer.from(b)),total)
  .toString("utf8")) as unknown;
 if(!plainObject(json))throw Error("M43_INVALID_JSON");
 return json;
}
function validJwksLocation(uri:unknown,issuer:string):uri is string{
 if(typeof uri!=="string"||uri.length>300)return false;
 try{
  const url=new URL(uri);
  return url.origin===issuer&&url.protocol==="https:"&&
   url.username===""&&url.password===""&&url.search===""&&
   url.hash===""&&url.pathname.startsWith("/")&&
   !url.pathname.includes("..")&&!url.pathname.includes("//")&&
   /^[\/a-zA-Z0-9._-]+$/.test(url.pathname)&&url.href===uri;
 }catch{return false;}
}
/**
 * A real public protocol check when an administrator has deliberately
 * pinned the issuer/key in server-only configuration. Never accepts URLs
 * from a request, merchant or token; refuses cross-origin JWKS fetching.
 */
export async function inspectFiscalM43Oidc(
 trust:FiscalM43PublicTrust|null,request:Reader=fetch
):Promise<FiscalM43Status>{
 if(trust===null)return failed("not_configured");
 const key=strictPublicKey(trust);
 if(!key)return failed("invalid_pin");
 let discovery:Json;
 try{
  discovery=await readJson(request,trust.issuer+"/.well-known/openid-configuration");
 }catch{return failed("unavailable");}
 if(discovery.issuer!==trust.issuer||
  !validJwksLocation(discovery.jwks_uri,trust.issuer)||
  (discovery.id_token_signing_alg_values_supported!==undefined&&
  (!Array.isArray(discovery.id_token_signing_alg_values_supported)||
   !discovery.id_token_signing_alg_values_supported.includes("RS256"))))
  return failed("provider_mismatch");
 let jwks:Json;
 try{jwks=await readJson(request,discovery.jwks_uri);}
 catch{return failed("unavailable");}
 if(!Array.isArray(jwks.keys)||jwks.keys.length>16)
  return failed("provider_mismatch");
 const matching=jwks.keys.filter(k=>plainObject(k)&&k.kid===trust.keyId);
 if(matching.length!==1)return failed("provider_mismatch");
 const jwk=matching[0] as Json;
 if(jwk.kty!=="RSA"||jwk.n!==key.n||jwk.e!==key.e||
  (jwk.alg!==undefined&&jwk.alg!=="RS256")||
  (jwk.use!==undefined&&jwk.use!=="sig")||
  (jwk.key_ops!==undefined&&
   (!Array.isArray(jwk.key_ops)||
    jwk.key_ops.length!==1||jwk.key_ops[0]!=="verify"))||
  ["d","p","q","dp","dq","qi","oth","k"].some(k=>k in jwk))
  return failed("provider_mismatch");
 return Object.freeze({
  ...failed("public_jwks_verified"),
  pinnedPublicKeyMatched:true,oidcDiscoveryVerified:true
 });
}

/** Protected operator diagnostic only; never serializes the supplied pins. */
export async function getFiscalM43OidcReadiness(
 env:NodeJS.ProcessEnv
):Promise<FiscalM43Status>{
 const issuer=env.FISCAL_KYB_OIDC_ISSUER;
 const keyId=env.FISCAL_KYB_OIDC_KID;
 const pem=env.FISCAL_KYB_OIDC_PUBLIC_KEY_PEM;
 if(!issuer&&!keyId&&!pem)return failed("not_configured");
 if(!issuer||!keyId||!pem)return failed("invalid_pin");
 return inspectFiscalM43Oidc({issuer,keyId,publicKeyPem:pem});
}

/**
 * M40 — OFFLINE verification gate for a *future* synthetic Storage probe.
 *
 * This module does NOT issue credentials, register a signing key at Supabase,
 * grant Storage access, or connect to any live job. Public keys must be pinned
 * by a separately governed issuer configuration, NEVER taken from a token,
 * request, or user-controlled JWKS URL. Valid local signatures do not prove
 * that Supabase Storage will accept the JWT.
 */
import {createPublicKey,verify as verifySignature} from "node:crypto";
import {
 runFiscalSyntheticStorageApiProbe,
 type FiscalSyntheticStorageProbeArgs
} from "./fiscal-kyb-vault-storage-api-probe.ts";

const ROLE="fiscal_kyb_probe";
const PURPOSE="fiscal_kyb_synthetic_probe_v1";
const SUBJECT="fiscal_kyb_probe";
const AUDIENCE="fiscal-kyb-synthetic-probe";
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type JsonRecord=Record<string,unknown>;
export type FiscalSyntheticProbeTrust=Readonly<{
 issuer:string;keyId:string;publicKeyPem:string;
}>;
export type FiscalSignedProbeArgs=FiscalSyntheticStorageProbeArgs&
 Readonly<{trust:FiscalSyntheticProbeTrust}>;

function deny():never{throw Error("FISCAL_M40_TOKEN_NOT_VERIFIED");}
function objectFromPart(part:string):JsonRecord{
 if(!part||part.length>3000||!/^[A-Za-z0-9_-]+$/.test(part))return deny();
 try{
  const bytes=Buffer.from(part,"base64url");
  if(bytes.toString("base64url")!==part)return deny();
  const value=JSON.parse(bytes.toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))return deny();
  return value as JsonRecord;
 }catch{return deny();}
}
function strictIssuer(value:unknown):value is string{
 if(typeof value!=="string"||value.length>256)return false;
 try{
  const url=new URL(value);
  return url.protocol==="https:"&&Boolean(url.hostname)&&
   url.username===""&&url.password===""&&url.search===""&&url.hash===""&&
   url.origin===value;
 }catch{return false;}
}
const int=(x:unknown):x is number=>typeof x==="number"&&
 Number.isSafeInteger(x);

/**
 * Verify before any network access. No private key, network lookup,
 * filesystem read, environment variable or live Storage operation occurs.
 */
export function verifyFiscalSyntheticProbeJwt(
 jwt:string,trust:FiscalSyntheticProbeTrust,now:number
):Readonly<{runId:string;tokenId:string;expiresAt:number;signatureVerified:true;syntheticOnly:true}>{
 if(typeof jwt!=="string"||jwt.length>4096||
  !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)||
  !trust||!strictIssuer(trust.issuer)||
  typeof trust.keyId!=="string"||
  !/^[A-Za-z0-9_-]{8,80}$/.test(trust.keyId)||
  typeof trust.publicKeyPem!=="string"||
  !trust.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")||
  trust.publicKeyPem.length>8192||
  !Number.isSafeInteger(now)||now<=0) return deny();
 const [headerPart,claimPart,signaturePart]=jwt.split(".");
 const header=objectFromPart(headerPart);
 // Allow only a pinned RS256 public key: no alg confusion, header-provided key,
 // remote key lookup, or crit-header downgrades.
 if(Object.keys(header).sort().join(",")!=="alg,kid,typ"||
  header.alg!=="RS256"||header.typ!=="JWT"||header.kid!==trust.keyId)
  return deny();
 const claims=objectFromPart(claimPart);
 let publicKey;
 try{
  publicKey=createPublicKey(trust.publicKeyPem);
  if(publicKey.asymmetricKeyType!=="rsa"||
   (publicKey.asymmetricKeyDetails?.modulusLength??0)<3072)return deny();
 }catch{return deny();}
 const signature=Buffer.from(signaturePart,"base64url");
 if(signature.toString("base64url")!==signaturePart)return deny();
 try{
  if(!verifySignature("RSA-SHA256",Buffer.from(headerPart+"."+claimPart),
   publicKey,signature))return deny();
 }catch{return deny();}
 const nowSeconds=Math.floor(now/1000);
 if(claims.iss!==trust.issuer||claims.aud!==AUDIENCE||
  claims.sub!==SUBJECT||claims.role!==ROLE||claims.purpose!==PURPOSE||
  typeof claims.probe_run_id!=="string"||!UUID_V4.test(claims.probe_run_id)||
  typeof claims.jti!=="string"||!UUID_V4.test(claims.jti)||
  !int(claims.iat)||!int(claims.nbf)||!int(claims.exp)||
  claims.iat>nowSeconds+30||claims.iat<nowSeconds-300||
  claims.nbf>nowSeconds||claims.nbf<claims.iat-30||
  claims.exp<=nowSeconds||claims.exp>nowSeconds+300||
  claims.exp<=claims.iat||claims.exp-claims.iat>300)
  return deny();
 return Object.freeze({
  runId:claims.probe_run_id,
  tokenId:claims.jti,
  expiresAt:claims.exp,
  signatureVerified:true as const,
  syntheticOnly:true as const
 });
}

/** Controlled wrapper for future synthetic-only calls; no live route imports it. */
export async function runFiscalVerifiedSyntheticStorageProbe(args:FiscalSignedProbeArgs){
 verifyFiscalSyntheticProbeJwt(args.scopedJwt,args.trust,args.now);
 return runFiscalSyntheticStorageApiProbe(args);
}

export function inspectFiscalM40Readiness(){
 return Object.freeze({
  offlineSignatureVerifierTested:true as const,
  externallyProvisionedIssuer:false as const,
  supabaseKeyTrustVerified:false as const,
  liveProbeAuthorized:false as const,
  policyActivated:false as const,
  merchantDocumentUploads:false as const,
  aadeIssuanceEnabled:false as const
 });
}

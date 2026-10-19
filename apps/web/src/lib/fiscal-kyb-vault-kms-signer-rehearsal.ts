/**
 * M41 — synthetic-only KMS Sign adapter CONTRACT. No real AWS client, key,
 * credentials, issuer, OIDC endpoint or Storage permission is provisioned.
 *
 * This module is not imported by a route/worker. An externally supplied
 * signer models AWS KMS Sign with a pinned key ARN; signature and claims are
 * independently verified against M40 BEFORE any credential is returned.
 * Tokens are only for synthetic test runs and are not proof of Supabase trust.
 */
import {createPublicKey,randomUUID} from "node:crypto";
import {
 verifyFiscalSyntheticProbeJwt,
 type FiscalSyntheticProbeTrust
} from "./fiscal-kyb-vault-signed-probe.ts";

const SIGNING_ALGORITHM="RSASSA_PKCS1_V1_5_SHA_256" as const;
const KMS_KEY_ARN=/^arn:aws:kms:eu-central-1:[0-9]{12}:key\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LIFETIME_SECONDS=180;

export type FiscalKmsProbeSignRequest=Readonly<{
 KeyId:string;
 Message:Uint8Array;
 MessageType:"RAW";
 SigningAlgorithm:typeof SIGNING_ALGORITHM;
}>;
export type FiscalKmsProbeSignResponse=Readonly<{
 KeyId?:string;
 Signature?:Uint8Array;
 SigningAlgorithm?:string;
}>;
export type FiscalKmsProbeSigner=(
 request:FiscalKmsProbeSignRequest
)=>Promise<FiscalKmsProbeSignResponse>;

export type FiscalKmsProbeRehearsalArgs=Readonly<{
 trust:FiscalSyntheticProbeTrust;
 kmsKeyArn:string;
 runId:string;
 now:number;
 sign:FiscalKmsProbeSigner;
}>;

function deny():never{throw Error("FISCAL_M41_KMS_REHEARSAL_DENIED");}
function validate(args:FiscalKmsProbeRehearsalArgs){
 if(!args||typeof args!=="object"||typeof args.sign!=="function"||
  typeof args.kmsKeyArn!=="string"||!KMS_KEY_ARN.test(args.kmsKeyArn)||
  typeof args.runId!=="string"||!UUID_V4.test(args.runId)||
  !Number.isSafeInteger(args.now)||args.now<=0||
  !args.trust||typeof args.trust!=="object"||
  typeof args.trust.issuer!=="string"||
  typeof args.trust.keyId!=="string"||
  !/^[A-Za-z0-9_-]{8,80}$/.test(args.trust.keyId)||
  typeof args.trust.publicKeyPem!=="string")return deny();
 let issuer:URL;
 try{issuer=new URL(args.trust.issuer);}catch{return deny();}
 if(issuer.protocol!=="https:"||issuer.origin!==args.trust.issuer||
  issuer.username!==""||issuer.password!==""||
  issuer.search!==""||issuer.hash!=="")return deny();
 try{
  const key=createPublicKey(args.trust.publicKeyPem);
  if(key.asymmetricKeyType!=="rsa"||
    (key.asymmetricKeyDetails?.modulusLength??0)<3072)return deny();
 }catch{return deny();}
}

/** Offline contract rehearsal ONLY. Never call from a live application route. */
export async function mintFiscalSyntheticProbeJwtInRehearsal(
 args:FiscalKmsProbeRehearsalArgs
):Promise<Readonly<{jwt:string;runId:string;tokenId:string;expiresAt:number;syntheticOnly:true}>>{
 validate(args);
 const sec=Math.floor(args.now/1000);
 const jti=randomUUID();
 const header={alg:"RS256",typ:"JWT",kid:args.trust.keyId};
 const claims={
  iss:args.trust.issuer,
  aud:"fiscal-kyb-synthetic-probe",
  sub:"fiscal_kyb_probe",
  role:"fiscal_kyb_probe",
  purpose:"fiscal_kyb_synthetic_probe_v1",
  probe_run_id:args.runId,
  jti,
  iat:sec,nbf:sec,exp:sec+LIFETIME_SECONDS
 };
 const signingInput=
  Buffer.from(JSON.stringify(header)).toString("base64url")+"."+
  Buffer.from(JSON.stringify(claims)).toString("base64url");
 // RAW: KMS hashes the message once. DIGEST here would be incorrect.
 const message=Buffer.from(signingInput,"utf8");
 let response:FiscalKmsProbeSignResponse;
 try{
  response=await args.sign(Object.freeze({
   KeyId:args.kmsKeyArn,
   Message:new Uint8Array(message),
   MessageType:"RAW" as const,
   SigningAlgorithm:SIGNING_ALGORITHM
  }));
 }catch{return deny();}
 if(!response||response.KeyId!==args.kmsKeyArn||
  response.SigningAlgorithm!==SIGNING_ALGORITHM||
  !(response.Signature instanceof Uint8Array)||
  response.Signature.byteLength<256||
  response.Signature.byteLength>1024)return deny();
 const jwt=signingInput+"."+Buffer.from(response.Signature).toString("base64url");
 try{
  const verified=verifyFiscalSyntheticProbeJwt(jwt,args.trust,args.now);
  if(verified.runId!==args.runId||verified.tokenId!==jti||
   verified.expiresAt!==claims.exp)return deny();
 }catch{return deny();}
 return Object.freeze({jwt,runId:args.runId,tokenId:jti,
  expiresAt:claims.exp,syntheticOnly:true as const});
}

/** Static release-truth flags; no secret, KMS API or network introspection. */
export function inspectFiscalM41Readiness(){
 return Object.freeze({
  kmsSigningContractInCi:true as const,
  liveKmsKeyProvisioned:false as const,
  externalIssuerConfigured:false as const,
  oidcDiscoveryPublished:false as const,
  supabaseIssuerTrustVerified:false as const,
  replayPreventionVerified:false as const,
  storagePoliciesActivated:false as const,
  merchantDocumentUploads:false as const,
  legalFiscalIssuance:false as const
 });
}

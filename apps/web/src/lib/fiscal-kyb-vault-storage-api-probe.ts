/**
 * M37 — provider-specific, SERVER-ONLY synthetic Storage API lifecycle client.
 *
 * Not imported by any production route, worker, or page, and never auto-runs.
 * The FISCAL deployment has NO scoped Storage credential or independent KMS
 * grant; this module cannot run a real probe until these are separately
 * provisioned, authorized, and passed explicitly by a future controlled job.
 *
 * This routine accepts NO customer documents, file names, object paths, or
 * plaintext input. It creates its own throwaway random bytes, encrypts
 * them (AES-256-GCM with ephemeral local key — NOT an independently verified
 * KMS), POSTs ciphertext only, authenticates GET bytes, DELETEs the exact
 * generated key and confirms GET returns 404. All calls use the Storage API,
 * never SQL mutations against storage.objects.
 *
 * Authorization is ultimately enforced by the remote Storage API's JWT and
 * RLS, not by checking claims in this module. The local checks are defense
 * in depth against mistakenly supplying an admin/service-role credential.
 */
import {createCipheriv,createHash,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";

const PROJECT_URL="https://kcpwxplxqtqdsfwlfsaa.supabase.co";
const BUCKET="fiscal-kyb-quarantine";
const PURPOSE="fiscal_kyb_synthetic_probe_v1";
const ROLE="fiscal_kyb_probe";
const MARKER=Buffer.from("KMFS37\0","ascii");
const HEADER_BYTES=MARKER.length+12+16;
const LIMIT_BYTES=512;
const MAX_RESPONSE_BYTES=4096;

export type FiscalSyntheticStorageProbeResult=Readonly<{
 status:"passed"|"failed"|"blocked";
 uploadAccepted:boolean;ciphertextRoundTripVerified:boolean;
 deletionRequestAccepted:boolean;notFoundAfterDeletion:boolean;
 cleanupUncertain:boolean;syntheticOnly:true;
 ephemeralLocalKeyOnly:true;externallyVerifiedKms:false;
 liveKybEvidenceAccepted:false;merchantUploadsEnabled:false;
 documentReadAuthorized:false;fiscalIssuanceEnabled:false;
}>;

type Network=(input:string,init:RequestInit)=>Promise<Response>;
export type FiscalSyntheticStorageProbeArgs=Readonly<{
 projectUrl:string;publishableKey:string;scopedJwt:string;
 request:Network;now:number;
}>;

const status=(state:FiscalSyntheticStorageProbeResult["status"],f:{
 uploadAccepted:boolean;ciphertextRoundTripVerified:boolean;
 deletionRequestAccepted:boolean;notFoundAfterDeletion:boolean;
 cleanupUncertain:boolean
}):FiscalSyntheticStorageProbeResult=>Object.freeze({
 status:state,...f,syntheticOnly:true as const,ephemeralLocalKeyOnly:true as const,
 externallyVerifiedKms:false as const,liveKybEvidenceAccepted:false as const,
 merchantUploadsEnabled:false as const,documentReadAuthorized:false as const,
 fiscalIssuanceEnabled:false as const
});

function validate(args:FiscalSyntheticStorageProbeArgs){
 if(!args||typeof args!=="object"||typeof args.request!=="function"||
  args.projectUrl!==PROJECT_URL||typeof args.publishableKey!=="string"||
  typeof args.scopedJwt!=="string"||!Number.isSafeInteger(args.now)||
  args.now<=0)throw new Error("FISCAL_M37_PROBE_CONFIG_INVALID");
 const key=args.publishableKey;
 // A legacy anon JWT (role anon) is permitted, never a service_role key.
 if(!key.startsWith("sb_publishable_")&&jwtRole(key)!=="anon")
  throw new Error("FISCAL_M37_PROBE_KEY_UNSAFE");
 const claim=parseClaims(args.scopedJwt);
 if(typeof claim.probe_run_id!=="string"||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(claim.probe_run_id)||
  claim.role!==ROLE||claim.purpose!==PURPOSE||
  typeof claim.exp!=="number"||!Number.isSafeInteger(claim.exp)||
  claim.exp<=Math.floor(args.now/1000)||
  claim.exp>Math.floor(args.now/1000)+15*60||
  typeof claim.iat!=="number"||!Number.isSafeInteger(claim.iat)||
  claim.iat>Math.floor(args.now/1000)+60||
  claim.iat<Math.floor(args.now/1000)-15*60)
  throw new Error("FISCAL_M37_PROBE_SCOPE_INVALID");
 // These parsed JWT claims are NOT treated as authentication proof.
 // Supabase Storage still MUST validate the real JWT signature and role.
}

function parseClaims(jwt:string):Record<string,unknown>{
 if(jwt.length>4096||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt))
  throw new Error("FISCAL_M37_PROBE_JWT_INVALID");
 try{
  const value=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))
   throw Error("invalid");
  return value as Record<string,unknown>;
 }catch{throw new Error("FISCAL_M37_PROBE_JWT_INVALID");}
}
function jwtRole(jwt:string){
 try{return parseClaims(jwt).role;}catch{return undefined;}
}

function seal(key:Buffer,body:Buffer){
 const nonce=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,nonce);
 cipher.setAAD(Buffer.from(PURPOSE,"utf8"));
 const encrypted=Buffer.concat([cipher.update(body),cipher.final()]);
 return Buffer.concat([MARKER,nonce,cipher.getAuthTag(),encrypted]);
}

function exactEqual(a:Buffer,b:Buffer){
 return a.length===b.length&&timingSafeEqual(
  createHash("sha256").update(a).digest(),
  createHash("sha256").update(b).digest());
}

async function boundedBytes(response:Response){
 if(response.redirected)throw Error("M37_REDIRECT_REJECTED");
 const length=response.headers.get("content-length");
 if(length&&(Number(length)>MAX_RESPONSE_BYTES||!Number.isFinite(Number(length))))
  throw Error("M37_RESPONSE_TOO_LARGE");
 const source=response.body;
 if(!source)throw Error("M37_RESPONSE_EMPTY");
 const reader=source.getReader();
 const chunks:Uint8Array[]=[];
 let total=0;
 try{
  while(true){
   const next=await reader.read();
   if(next.done)break;
   total+=next.value.byteLength;
   if(total>MAX_RESPONSE_BYTES)throw Error("M37_RESPONSE_TOO_LARGE");
   chunks.push(next.value);
  }
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks.map(b=>Buffer.from(b)),total);
}

/** Only for a future isolated, explicitly authorized synthetic-only job. */
export async function runFiscalSyntheticStorageApiProbe(
 args:FiscalSyntheticStorageProbeArgs
):Promise<FiscalSyntheticStorageProbeResult>{
 validate(args);
 const path="__synthetic_m37__/"+(parseClaims(args.scopedJwt).probe_run_id as string)+"/"+randomBytes(16).toString("hex")+".bin";
 const url=PROJECT_URL+"/storage/v1/object/"+BUCKET+"/"+path;
 const auth={
  Authorization:"Bearer "+args.scopedJwt,
  apikey:args.publishableKey
 };
 const request=args.request;
 const fields={
  uploadAccepted:false,ciphertextRoundTripVerified:false,
  deletionRequestAccepted:false,notFoundAfterDeletion:false,
  cleanupUncertain:false
 };
 let key:Buffer|undefined,plain:Buffer|undefined,ciphertext:Buffer|undefined;
 let attempted=false;
 async function send(method:string,body?:Uint8Array){
  const init:RequestInit={
   method,redirect:"manual",
   cache:"no-store",signal:AbortSignal.timeout(5000)
  };
  init.headers={
   ...auth,...(method==="POST"?{
    "Content-Type":"application/octet-stream",
    "cache-control":"no-store","x-upsert":"false"
   }:{})
  };
  if(body){
   const wire=new Uint8Array(body.byteLength);
   wire.set(body);
   init.body=wire.buffer;
  }
  return request(method==="GET"?
   PROJECT_URL+"/storage/v1/object/authenticated/"+BUCKET+"/"+path:
   method==="DELETE"?PROJECT_URL+"/storage/v1/object/"+BUCKET:
   url,method==="DELETE"?{...init,headers:{
    ...auth,"Content-Type":"application/json"
   },body:JSON.stringify({prefixes:[path]})}:init);
 }
 async function deleteAndCheck(){
  const removed=await send("DELETE");
  if(!removed.ok)return false;
  fields.deletionRequestAccepted=true;
  const absent=await send("GET");
  fields.notFoundAfterDeletion=absent.status===404;
  return fields.notFoundAfterDeletion;
 }
 try{
  key=randomBytes(32);
  plain=randomBytes(64);
  ciphertext=seal(key,plain);
  if(ciphertext.length<=HEADER_BYTES||
   ciphertext.length>LIMIT_BYTES||
   !ciphertext.subarray(0,MARKER.length).equals(MARKER))
   throw Error("M37_INVALID_CIPHERTEXT");
  attempted=true;
  const put=await send("POST",new Uint8Array(ciphertext));
  if(!put.ok)throw Error("M37_STORAGE_PUT_FAILED");
  fields.uploadAccepted=true;
  const downloaded=await send("GET");
  if(!downloaded.ok)throw Error("M37_STORAGE_GET_FAILED");
  const found=await boundedBytes(downloaded);
  fields.ciphertextRoundTripVerified=exactEqual(found,ciphertext);
  found.fill(0);
  if(!fields.ciphertextRoundTripVerified)throw Error("M37_STORAGE_MISMATCH");
  if(!await deleteAndCheck())throw Error("M37_DELETE_UNCONFIRMED");
  return status("passed",fields);
 }catch{
  // If upload may have reached storage, always attempt cleanup on failure.
  if(attempted&&!fields.notFoundAfterDeletion){
   try{await deleteAndCheck();}catch{}
   fields.cleanupUncertain=!fields.notFoundAfterDeletion;
  }
  return status("failed",fields);
 }finally{
  key?.fill(0);
  plain?.fill(0);
  ciphertext?.fill(0);
 }
}

/**
 * Production remains disconnected. This status does not parse or expose any
 * environment variable values and is not an execution switch.
 */
export function inspectFiscalM37IntegrationReadiness(env:NodeJS.ProcessEnv){
 const supplied=Boolean(
  env.FISCAL_VAULT_SCOPED_STORAGE_JWT&&
  env.FISCAL_VAULT_PUBLIC_STORAGE_KEY
 );
 return Object.freeze({
  scopedCredentialsPresent:supplied,
  actualScopedCredentialVerified:false as const,
  independentKmsIntegrationVerified:false as const,
  authenticatedScannerAvailable:false as const,
  productionProbeExecuted:false as const,
  manualDeploymentApprovalObtained:false as const,
  productionIntegrationEnabled:false as const,
  realDocumentsAccepted:false as const
 });
}

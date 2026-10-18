/**
 * M32: OFFLINE SERVER-SIDE QUARANTINE CRYPTOGRAPHY PRIMITIVES.
 *
 * THIS MODULE IS NOT A STORAGE SERVICE. No production invocation, bucket, KMS
 * grant, upload route, scanner, document viewer, delete operation or external
 * legal clearance is connected. All callers must supply their own 32-byte key
 * from a future independently audited KMS. Never import into browser code.
 *
 * Handles bounded synthetic/test bytes in memory and seals them before any
 * future quarantine storage integration. The internal verifier never returns
 * decrypted content. Neither a valid tag nor a filename signature proves a
 * document is malware-free or authorizes release.
 */
import {
 createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual
} from "node:crypto";
import {fiscalKybChecks} from "./fiscal-kyb-checks.ts";
import {evaluateFiscalKybCandidateFile} from "./fiscal-kyb-evidence-upload-policy.ts";
import type {FiscalKybCandidateFile} from "./fiscal-kyb-evidence-upload-policy.ts";

export const FISCAL_KYB_VAULT_MAX_BYTES=5*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const HEX=/^[0-9a-f]+$/;
const allowedMimes=["application/pdf","image/png","image/jpeg"] as const;

export type FiscalVaultContext=Readonly<{
 organizationId:string;
 evidenceId:string;
 checkType:(typeof fiscalKybChecks)[number];
}>;
export type FiscalVaultEnvelope=Readonly<{
 version:1;
 algorithm:"AES-256-GCM";
 organizationId:string;
 evidenceId:string;
 checkType:(typeof fiscalKybChecks)[number];
 mimeType:string;
 byteLength:number;
 sha256:string;
 nonceHex:string;
 ciphertextHex:string;
 tagHex:string;
 scanStatus:"unscanned";
 quarantineOnly:true;
 releaseAuthorized:false;
 fiscalIssuanceEnabled:false;
}>;

function context(raw:unknown):FiscalVaultContext{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("VAULT_CONTEXT_INVALID");
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).sort().join(",")!=="checkType,evidenceId,organizationId"||
  typeof r.organizationId!=="string"||!UUID.test(r.organizationId)||
  typeof r.evidenceId!=="string"||!UUID.test(r.evidenceId)||
  !fiscalKybChecks.some(k=>k===r.checkType))
  throw new Error("VAULT_CONTEXT_INVALID");
 return {
  organizationId:r.organizationId.toLowerCase(),
  evidenceId:r.evidenceId.toLowerCase(),
  checkType:r.checkType as FiscalVaultContext["checkType"]
 };
}
function validKey(key:unknown):Buffer{
 if(!Buffer.isBuffer(key)||key.byteLength!==32)throw new Error("VAULT_KEY_INVALID");
 return key;
}
function mimeLooksCorrect(bytes:Buffer,mime:string):boolean{
 if(mime==="application/pdf")
  return bytes.length>=8&&bytes.subarray(0,5).equals(Buffer.from("%PDF-","ascii"));
 if(mime==="image/png")
  return bytes.length>=8&&bytes.subarray(0,8).equals(
   Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==="image/jpeg")
  return bytes.length>=5&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&
   bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
 return false;
}
function aad(c:FiscalVaultContext,mime:string,length:number,sha:string){
 return Buffer.from(JSON.stringify([
  "KONTA_MOY_FISCAL_KYB_QUARANTINE_V1",c.organizationId,c.evidenceId,
  c.checkType,mime,length,sha
 ]),"utf8");
}
function equalSha(a:string,b:string){
 return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}

/** Offline-only encryption primitive. Does not persist or authorize anything. */
export function sealFiscalKybQuarantineInMemory(args:Readonly<{
 context:unknown;
 metadata:unknown;
 plaintext:Buffer;
 encryptionKey:Buffer;
}>):FiscalVaultEnvelope{
 const c=context(args?.context);
 const key=validKey(args?.encryptionKey);
 if(!Buffer.isBuffer(args?.plaintext))throw new Error("VAULT_BYTES_INVALID");
 const bytes=args.plaintext;
 const result=evaluateFiscalKybCandidateFile(args.metadata);
 if(!result.metadataAccepted)throw new Error("VAULT_METADATA_INVALID");
 const meta=args.metadata as FiscalKybCandidateFile;
 if(bytes.length!==meta.byteLength||bytes.length>FISCAL_KYB_VAULT_MAX_BYTES)
  throw new Error("VAULT_BYTES_INVALID");
 if(!mimeLooksCorrect(bytes,meta.mimeType))
  throw new Error("VAULT_SIGNATURE_MISMATCH");
 const actualSha=createHash("sha256").update(bytes).digest("hex");
 if(!equalSha(actualSha,meta.sha256))
  throw new Error("VAULT_CHECKSUM_MISMATCH");
 const nonce=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,nonce);
 cipher.setAAD(aad(c,meta.mimeType,bytes.length,actualSha));
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Object.freeze({
  version:1 as const,algorithm:"AES-256-GCM" as const,
  ...c,mimeType:meta.mimeType,byteLength:bytes.length,sha256:actualSha,
  nonceHex:nonce.toString("hex"),ciphertextHex:ciphertext.toString("hex"),
  tagHex:cipher.getAuthTag().toString("hex"),
  scanStatus:"unscanned" as const,
  quarantineOnly:true as const,
  releaseAuthorized:false as const,
  fiscalIssuanceEnabled:false as const
 });
}

/**
 * Authenticity/tenant-binding check without exposing plaintext. Intended for
 * integration tests, NOT as a way to inspect or release evidence to anyone.
 */
export function verifyFiscalKybQuarantineIntegrity(args:Readonly<{
 expectedContext:unknown;
 envelope:unknown;
 encryptionKey:Buffer;
}>){
 const expected=context(args?.expectedContext);
 const key=validKey(args?.encryptionKey);
 const e=args?.envelope;
 if(!e||typeof e!=="object"||Array.isArray(e))
  throw new Error("VAULT_ENVELOPE_INVALID");
 const obj=e as Record<string,unknown>;
 const keys=[
  "version","algorithm","organizationId","evidenceId","checkType",
  "mimeType","byteLength","sha256","nonceHex","ciphertextHex","tagHex",
  "scanStatus","quarantineOnly","releaseAuthorized","fiscalIssuanceEnabled"
 ];
 if(Object.keys(obj).sort().join(",")!==keys.sort().join(",")||
  obj.version!==1||obj.algorithm!=="AES-256-GCM"||
  obj.scanStatus!=="unscanned"||obj.quarantineOnly!==true||
  obj.releaseAuthorized!==false||obj.fiscalIssuanceEnabled!==false||
  obj.organizationId!==expected.organizationId||
  obj.evidenceId!==expected.evidenceId||obj.checkType!==expected.checkType||
  typeof obj.mimeType!=="string"||
  !(allowedMimes as readonly string[]).includes(obj.mimeType)||
  typeof obj.byteLength!=="number"||!Number.isSafeInteger(obj.byteLength)||
  obj.byteLength<=0||obj.byteLength>FISCAL_KYB_VAULT_MAX_BYTES||
  typeof obj.sha256!=="string"||!SHA.test(obj.sha256)||
  typeof obj.nonceHex!=="string"||!/^[a-f0-9]{24}$/.test(obj.nonceHex)||
  typeof obj.tagHex!=="string"||!/^[a-f0-9]{32}$/.test(obj.tagHex)||
  typeof obj.ciphertextHex!=="string"||
  obj.ciphertextHex.length!==obj.byteLength*2||
  !HEX.test(obj.ciphertextHex))
  throw new Error("VAULT_ENVELOPE_INVALID");
 const decipher=createDecipheriv("aes-256-gcm",key,
  Buffer.from(obj.nonceHex,"hex"));
 decipher.setAAD(aad(expected,obj.mimeType,obj.byteLength,obj.sha256));
 decipher.setAuthTag(Buffer.from(obj.tagHex,"hex"));
 let plain:Buffer|undefined;
 try{
  plain=Buffer.concat([
   decipher.update(Buffer.from(obj.ciphertextHex,"hex")),decipher.final()
  ]);
  const digest=createHash("sha256").update(plain).digest("hex");
  if(!equalSha(digest,obj.sha256)||
     !mimeLooksCorrect(plain,obj.mimeType))
   throw new Error("VAULT_INTEGRITY_FAILED");
  return Object.freeze({
   integrityValid:true as const,tenantBound:true as const,
   scanStatus:"unscanned" as const,releaseAuthorized:false as const,
   bytesExposed:false as const,canPersist:false as const,
   fiscalIssuanceEnabled:false as const
  });
 }catch{
  // Do not distinguish malicious GCM tags, bad keys, or tampered documents.
  throw new Error("VAULT_INTEGRITY_FAILED");
 }finally{
  plain?.fill(0);
 }
}

/** No runtime controls are wired. Plans never authorize execution or release. */
export const fiscalKybVaultLifecycle=Object.freeze([
 "quarantined","scan_rejected","clean_hold","pending_deletion","deleted"
] as const);
export function planFiscalKybVaultTransition(current:unknown,next:unknown){
 const transitions:Readonly<Record<string,readonly string[]>>={
  quarantined:["scan_rejected","clean_hold","pending_deletion"],
  scan_rejected:["pending_deletion"],
  clean_hold:["pending_deletion"],
  pending_deletion:["deleted"],
  deleted:[]
 };
 if(typeof current!=="string"||typeof next!=="string"||
  !Object.prototype.hasOwnProperty.call(transitions,current)||
  !transitions[current].includes(next))
  throw new Error("VAULT_STATE_TRANSITION_INVALID");
 return Object.freeze({
  from:current,to:next,transitionIsRecognized:true as const,
  requiresIndependentScanAttestation:next==="clean_hold",
  requiresVerifiedDeletion:next==="deleted",
  requiresOperatorAudit:true as const,
  mayExecute:false as const,mayRelease:false as const,
  mayIssue:false as const
 });
}

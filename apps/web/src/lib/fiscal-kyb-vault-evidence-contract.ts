/**
 * M33 — provider-neutral quarantine evidence verification contracts.
 *
 * This is NOT a live storage connector, upload endpoint, malware scanner,
 * legal KYB approval, KMS client or authorization to read documents.
 * It validates externally signed scanner statements and verifies locally
 * constructed audit hash chains. Real storage / scanner / signatures must
 * be independently provisioned, tested and approved before any activation.
 */
import {
 createHash,randomBytes,verify as verifySignature,
 type KeyObject
} from "node:crypto";
import {fiscalKybChecks} from "./fiscal-kyb-checks.ts";
import type {FiscalVaultContext,FiscalVaultEnvelope} from "./fiscal-kyb-vault-core.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const TOKEN=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const ZERO="0".repeat(64);
const SCAN_WINDOW_MS=15*60*1000;
const SCAN_SKEW_MS=60*1000;

export type FiscalVaultQuarantineLocator=Readonly<{
 organizationId:string;evidenceId:string;checkType:FiscalVaultContext["checkType"];
 key:string;purpose:"quarantine_only";signedUrlIssued:false;canStoreProduction:false;
}>;

function validateContext(raw:unknown):FiscalVaultContext{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw new Error("VAULT_SCOPE_INVALID");
 const c=raw as Record<string,unknown>;
 if(Object.keys(c).sort().join(",")!=="checkType,evidenceId,organizationId"||
  typeof c.organizationId!=="string"||!UUID.test(c.organizationId)||
  typeof c.evidenceId!=="string"||!UUID.test(c.evidenceId)||
  !fiscalKybChecks.some(x=>x===c.checkType))
  throw new Error("VAULT_SCOPE_INVALID");
 return c as FiscalVaultContext;
}

/** Identifier-only locator. Random, unguessable name; no file name or PII. */
export function planFiscalVaultQuarantineLocator(raw:unknown):FiscalVaultQuarantineLocator{
 const c=validateContext(raw);
 const salt=randomBytes(20).toString("hex");
 const key="kyb-quarantine/v1/"+c.organizationId+"/"+c.evidenceId+"/"+salt;
 return Object.freeze({
  ...c,key,purpose:"quarantine_only" as const,
  signedUrlIssued:false as const,canStoreProduction:false as const
 });
}

function exactKeys(raw:unknown,names:string[],code:string):Record<string,unknown>{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw new Error(code);
 const o=raw as Record<string,unknown>;
 if(Object.keys(o).sort().join(",")!==[...names].sort().join(","))
  throw new Error(code);
 return o;
}
function timestamp(value:unknown,now:number,code:string){
 if(typeof value!=="string"||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))
  throw new Error(code);
 const t=Date.parse(value);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==value||
  t<now-SCAN_WINDOW_MS||t>now+SCAN_SKEW_MS)
  throw new Error(code);
 return t;
}

const scanKeys=[
 "version","organizationId","evidenceId","checkType","encryptedDigest",
 "scannerId","scannerVersion","scannedAt","verdict","signatureHex"
] as const;
const scanUnsigned=scanKeys.filter(x=>x!=="signatureHex");
export type FiscalVaultScanStatement=Readonly<{
 version:1;organizationId:string;evidenceId:string;
 checkType:FiscalVaultContext["checkType"];
 encryptedDigest:string;scannerId:string;scannerVersion:string;
 scannedAt:string;verdict:"clean"|"malicious"|"scan_error";
 signatureHex:string;
}>;
export type FiscalVaultSignedScanValidation=Readonly<{
 signedStatementAuthentic:true;verdict:"clean"|"malicious"|"scan_error";
 quarantineMayOpen:false;canRelease:false;
 merchantApproved:false;statutoryIssuanceEnabled:false;
}>;

/**
 * Canonical wire bytes for a future independent scan signer. No signature is
 * created here: only an independently held Ed25519 private key could sign it.
 */
export function fiscalVaultScanSigningBytes(raw:unknown):Buffer{
 const r=exactKeys(raw,[...scanUnsigned],"VAULT_SCAN_INVALID");
 if(r.version!==1||typeof r.organizationId!=="string"||
  !UUID.test(r.organizationId)||typeof r.evidenceId!=="string"||
  !UUID.test(r.evidenceId)||
  !fiscalKybChecks.some(x=>x===r.checkType)||
  typeof r.encryptedDigest!=="string"||!SHA.test(r.encryptedDigest)||
  typeof r.scannerId!=="string"||!TOKEN.test(r.scannerId)||
  typeof r.scannerVersion!=="string"||!TOKEN.test(r.scannerVersion)||
  typeof r.scannedAt!=="string"||
  !["clean","malicious","scan_error"].includes(String(r.verdict)))
  throw new Error("VAULT_SCAN_INVALID");
 return Buffer.from(JSON.stringify(scanUnsigned.map(k=>r[k])),"utf8");
}

/** Digest of the full encrypted envelope, never plaintext or original name. */
export function digestFiscalVaultEncryptedEnvelope(envelope:FiscalVaultEnvelope){
 const value=exactKeys(envelope,[
  "version","algorithm","organizationId","evidenceId","checkType",
  "mimeType","byteLength","sha256","nonceHex","ciphertextHex","tagHex",
  "scanStatus","quarantineOnly","releaseAuthorized","fiscalIssuanceEnabled"
 ],"VAULT_ENVELOPE_DIGEST_INVALID");
 if(value.version!==1||value.algorithm!=="AES-256-GCM"||
  value.scanStatus!=="unscanned"||value.quarantineOnly!==true||
  value.releaseAuthorized!==false||value.fiscalIssuanceEnabled!==false||
  typeof value.ciphertextHex!=="string"||
  !/^[0-9a-f]+$/.test(value.ciphertextHex)||
  typeof value.sha256!=="string"||!SHA.test(value.sha256)||
  typeof value.tagHex!=="string"||!/^[0-9a-f]{32}$/.test(value.tagHex)||
  typeof value.nonceHex!=="string"||!/^[0-9a-f]{24}$/.test(value.nonceHex))
  throw new Error("VAULT_ENVELOPE_DIGEST_INVALID");
 const order=[
  "version","algorithm","organizationId","evidenceId","checkType",
  "mimeType","byteLength","sha256","nonceHex","ciphertextHex","tagHex",
  "scanStatus","quarantineOnly","releaseAuthorized","fiscalIssuanceEnabled"
 ];
 return createHash("sha256").update(JSON.stringify(order.map(k=>value[k]))).digest("hex");
}

/**
 * Validates a signature, scope, digest and freshness. 'clean' still NEVER
 * unlocks evidence: file parsing, scanner trust roots, immutable audit and
 * external/legal/operator approval are not configured by this module.
 */
export function verifyFiscalVaultScanStatement(args:Readonly<{
 statement:unknown;expectedContext:unknown;encryptedDigest:string;
 scannerPublicKey:KeyObject;now:number;
}>):FiscalVaultSignedScanValidation{
 const scope=validateContext(args?.expectedContext);
 const {statement,scannerPublicKey,now,encryptedDigest}=args;
 if(!Number.isFinite(now)||now<=0||!Number.isSafeInteger(now)||
  typeof encryptedDigest!=="string"||!SHA.test(encryptedDigest)||
  !scannerPublicKey||scannerPublicKey.type!=="public"||
  scannerPublicKey.asymmetricKeyType!=="ed25519")
  throw new Error("VAULT_SCAN_INVALID");
 const full=exactKeys(statement,[...scanKeys],"VAULT_SCAN_INVALID");
 const {signatureHex,...unsigned}=full;
 const payload=fiscalVaultScanSigningBytes(unsigned);
 if(typeof signatureHex!=="string"||!/^[0-9a-f]{128}$/.test(signatureHex)||
  unsigned.organizationId!==scope.organizationId||
  unsigned.evidenceId!==scope.evidenceId||
  unsigned.checkType!==scope.checkType||
  unsigned.encryptedDigest!==encryptedDigest)
  throw new Error("VAULT_SCAN_INVALID");
 timestamp(unsigned.scannedAt,now,"VAULT_SCAN_STALE");
 if(!verifySignature(null,payload,scannerPublicKey,Buffer.from(signatureHex,"hex")))
  throw new Error("VAULT_SCAN_SIGNATURE_INVALID");
 return Object.freeze({
  signedStatementAuthentic:true as const,
  verdict:unsigned.verdict as FiscalVaultSignedScanValidation["verdict"],
  quarantineMayOpen:false as const,canRelease:false as const,
  merchantApproved:false as const,statutoryIssuanceEnabled:false as const
 });
}

const auditKinds=[
 "quarantine_planned","ciphertext_written","scan_attested",
 "delete_requested","delete_observed"
] as const;
type AuditKind=(typeof auditKinds)[number];
type AuditEntry=Readonly<{
 sequence:number;previousHash:string;organizationId:string;
 evidenceId:string;checkType:FiscalVaultContext["checkType"];
 kind:AuditKind;encryptedDigest:string;recordedAt:string;hash:string;
}>;
const auditFields=[
 "sequence","previousHash","organizationId","evidenceId","checkType",
 "kind","encryptedDigest","recordedAt"
] as const;
function hashAudit(fields:Omit<AuditEntry,"hash">){
 return createHash("sha256").update(Buffer.from(JSON.stringify(
  ["KONTA_MOY_FISCAL_VAULT_AUDIT_V1",...auditFields.map(k=>fields[k])]
 ),"utf8")).digest("hex");
}

/** Hash-chain evidence only; independent external WORM anchoring is NOT present. */
export function appendFiscalVaultAuditPlan(args:Readonly<{
 previous:AuditEntry|null;scope:unknown;kind:AuditKind;
 encryptedDigest:string;recordedAt:string;
}>):AuditEntry{
 const scope=validateContext(args?.scope);
 if(!auditKinds.some(x=>x===args.kind)||
  typeof args.encryptedDigest!=="string"||!SHA.test(args.encryptedDigest)||
  typeof args.recordedAt!=="string"||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(args.recordedAt)||
  !Number.isFinite(Date.parse(args.recordedAt))||
  new Date(args.recordedAt).toISOString()!==args.recordedAt)
  throw new Error("VAULT_AUDIT_INVALID");
 const prev=args.previous;
 if(prev!==null&&(
  prev.organizationId!==scope.organizationId||
  prev.evidenceId!==scope.evidenceId||
  prev.checkType!==scope.checkType||
  prev.encryptedDigest!==args.encryptedDigest||
  !Number.isSafeInteger(prev.sequence)||prev.sequence<=0||
  prev.sequence>=1000000||
  prev.hash!==hashAudit(prev)||
  prev.recordedAt>args.recordedAt))
  throw new Error("VAULT_AUDIT_CHAIN_INVALID");
 const fields={
  sequence:prev?prev.sequence+1:1,previousHash:prev?prev.hash:ZERO,
  ...scope,kind:args.kind,encryptedDigest:args.encryptedDigest,
  recordedAt:args.recordedAt
 };
 return Object.freeze({...fields,hash:hashAudit(fields)});
}

/** No 'immutable' claim: without independently anchored logs, full rewrite is possible. */
export function inspectFiscalVaultAuditPlan(entries:readonly AuditEntry[]){
 if(!Array.isArray(entries)||entries.length>1000)
  throw new Error("VAULT_AUDIT_CHAIN_INVALID");
 let prev:AuditEntry|null=null;
 for(const e of entries){
  const canonical=appendFiscalVaultAuditPlan({
   previous:prev,
   scope:{organizationId:e.organizationId,evidenceId:e.evidenceId,
    checkType:e.checkType},
   kind:e.kind,encryptedDigest:e.encryptedDigest,
   recordedAt:e.recordedAt
  });
  if(canonical.hash!==e.hash||canonical.sequence!==e.sequence||
   canonical.previousHash!==e.previousHash)
   throw new Error("VAULT_AUDIT_CHAIN_INVALID");
  prev=e;
 }
 return Object.freeze({
  entriesChecked:entries.length,chainConsistent:true as const,
  independentlyAnchored:false as const,immutableAuditConfirmed:false as const,
  objectDeletedConfirmed:false as const,canRelease:false as const
 });
}
export const FISCAL_VAULT_PRODUCTION_GATES=Object.freeze({
 euStorageExternallyVerified:false,
 kmsKeySeparationExternallyVerified:false,
 privateObjectACLExternallyVerified:false,
 scannerIdentityExternallyVerified:false,
 scannerQuarantineExternallyVerified:false,
 auditWormAnchoringExternallyVerified:false,
 deleteLifecycleExternallyVerified:false,
 legalBasisExternallyVerified:false,
 operatorMfaExternallyVerified:false,
 acceptingBytes:false,
 acceptingUploads:false,
 productionWritesEnabled:false,
 issuingSignedReadUrls:false,
 issuerPermissionsEnabled:false
} as const);

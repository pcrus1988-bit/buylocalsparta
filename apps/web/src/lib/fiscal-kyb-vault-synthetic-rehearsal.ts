/**
 * M35: authenticated-operator-only synthetic rehearsal of KYB quarantine.
 *
 * This is intentionally a PURE IN-MEMORY SIMULATION, not a Storage/KMS
 * connector. No real merchant data, file contents, network calls or object
 * storage writes. Ephemeral encryption/scanner signing keys and synthetic
 * fixtures exist only for this single rehearsal; no key or ciphertext is
 * returned to the route. A passing rehearsal is not an external approval.
 */
import {
 createHash,generateKeyPairSync,randomBytes,randomUUID,sign
} from "node:crypto";
import {
 sealFiscalKybQuarantineInMemory,
 verifyFiscalKybQuarantineIntegrity
} from "./fiscal-kyb-vault-core.ts";
import {
 appendFiscalVaultAuditPlan,digestFiscalVaultEncryptedEnvelope,
 fiscalVaultScanSigningBytes,inspectFiscalVaultAuditPlan,
 planFiscalVaultQuarantineLocator,verifyFiscalVaultScanStatement
} from "./fiscal-kyb-vault-evidence-contract.ts";

export type FiscalKybSyntheticRehearsal=Readonly<{
 status:"passed"|"failed";
 checksPassed:number;
 checksTotal:8;
 syntheticOnly:true;
 actualBucketTouched:false;
 realDocumentAccepted:false;
 realScannerUsed:false;
 actualKmsUsed:false;
 externallyAnchoredAudit:false;
 independentLegalApproval:false;
 uploadAuthorized:false;
 signedDownloadIssued:false;
 realDeletionVerified:false;
 legalFiscalIssuanceEnabled:false;
}>;

function expect(condition:unknown){
 if(condition!==true)throw new Error("FISCAL_VAULT_SYNTHETIC_CHECK_FAILED");
}

/**
 * Deliberately accepts no arguments, preventing inbound filenames, contents,
 * IDs or credentials. Runs with throwaway keys and disposable bytes.
 */
export function runFiscalKybSyntheticRehearsal():FiscalKybSyntheticRehearsal{
 let passes=0;
 let cipherKey:Buffer|undefined;
 let plain:Buffer|undefined;
 const finish=(status:"passed"|"failed")=>Object.freeze({
  status,checksPassed:passes,checksTotal:8 as const,
  syntheticOnly:true as const,actualBucketTouched:false as const,
  realDocumentAccepted:false as const,realScannerUsed:false as const,
  actualKmsUsed:false as const,externallyAnchoredAudit:false as const,
  independentLegalApproval:false as const,uploadAuthorized:false as const,
  signedDownloadIssued:false as const,realDeletionVerified:false as const,
  legalFiscalIssuanceEnabled:false as const
 });
 try{
  const scope={organizationId:randomUUID(),evidenceId:randomUUID(),
   checkType:"business_registration" as const};
  const other={...scope,organizationId:randomUUID()};
  const locator=planFiscalVaultQuarantineLocator(scope);
  expect(locator.purpose==="quarantine_only"&&
   !locator.signedUrlIssued&&!locator.canStoreProduction&&
   locator.key.includes(scope.organizationId)&&locator.key.includes(scope.evidenceId));
  passes++;

  plain=Buffer.from("%PDF-1.7\n%M35 SYNTHETIC ONLY\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
  cipherKey=randomBytes(32);
  const envelope=sealFiscalKybQuarantineInMemory({
   context:scope,plaintext:plain,encryptionKey:cipherKey,
   metadata:{filename:"simulation.pdf",mimeType:"application/pdf",
    byteLength:plain.byteLength,
    sha256:createHash("sha256").update(plain).digest("hex")}
  });
  expect(!envelope.releaseAuthorized&&envelope.quarantineOnly&&
   envelope.scanStatus==="unscanned"&&
   verifyFiscalKybQuarantineIntegrity({
    envelope,expectedContext:scope,encryptionKey:cipherKey
   }).integrityValid);
  passes++;

  const storage=new Map<string,typeof envelope>();
  storage.set(locator.key,envelope);
  const read=(organizationId:string)=>organizationId===scope.organizationId?
   storage.get(locator.key):undefined;
  expect(read(other.organizationId)===undefined&&
   read(scope.organizationId)===envelope);
  passes++;

  const altered={...envelope,
   ciphertextHex:(envelope.ciphertextHex.startsWith("a")?"b":"a")+
    envelope.ciphertextHex.slice(1)};
  let tamperRejected=false;
  try{verifyFiscalKybQuarantineIntegrity({
   envelope:altered,expectedContext:scope,encryptionKey:cipherKey
  });}catch{tamperRejected=true;}
  expect(tamperRejected);
  passes++;

  const digest=digestFiscalVaultEncryptedEnvelope(envelope);
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const now=Date.now(),timestamp=new Date(now).toISOString();
  const statement={
   version:1,organizationId:scope.organizationId,evidenceId:scope.evidenceId,
   checkType:scope.checkType,encryptedDigest:digest,
   scannerId:"synthetic-ci",scannerVersion:"0.0.1",
   scannedAt:timestamp,verdict:"clean"
  } as const;
  const signatureHex=sign(
   null,fiscalVaultScanSigningBytes(statement),privateKey
  ).toString("hex");
  const signed={...statement,signatureHex};
  const verdict=verifyFiscalVaultScanStatement({
   expectedContext:scope,statement:signed,encryptedDigest:digest,
   scannerPublicKey:publicKey,now
  });
  expect(verdict.signedStatementAuthentic&&verdict.verdict==="clean"&&
   !verdict.quarantineMayOpen&&!verdict.canRelease&&
   !verdict.statutoryIssuanceEnabled);
  passes++;

  let forgedRejected=false;
  try{verifyFiscalVaultScanStatement({
   expectedContext:scope,encryptedDigest:digest,
   scannerPublicKey:publicKey,now,
   statement:{...signed,verdict:"malicious"}
  });}catch{forgedRejected=true;}
  expect(forgedRejected);
  passes++;

  const recordedAt=new Date(now).toISOString();
  const events=["quarantine_planned","ciphertext_written","scan_attested",
   "delete_requested","delete_observed"] as const;
  type E=ReturnType<typeof appendFiscalVaultAuditPlan>;
  const audit:E[]=[];
  for(const kind of events){
   audit.push(appendFiscalVaultAuditPlan({
    previous:audit[audit.length-1]??null,scope,kind,
    encryptedDigest:digest,recordedAt
   }));
  }
  const verification=inspectFiscalVaultAuditPlan(audit);
  expect(verification.chainConsistent&&
   verification.entriesChecked===events.length&&
   !verification.independentlyAnchored&&
   !verification.objectDeletedConfirmed);
  passes++;

  storage.delete(locator.key);
  expect(storage.size===0&&read(scope.organizationId)===undefined);
  passes++;
  return finish("passed");
 }catch{
  return finish("failed");
 }finally{
  cipherKey?.fill(0);
  plain?.fill(0);
 }
}

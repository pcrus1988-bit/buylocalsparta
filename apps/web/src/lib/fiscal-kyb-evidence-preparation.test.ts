import test from "node:test";
import assert from "node:assert/strict";
import {fiscalKybPreparationEntries,summarizeFiscalKybLocalPreparation} from "./fiscal-kyb-evidence-preparation.ts";
import {evaluateFiscalKybCandidateFile,fiscalKybStorageReadiness} from "./fiscal-kyb-evidence-upload-policy.ts";

test("seven static preparation categories contain no user-supplied values",()=>{
 assert.equal(fiscalKybPreparationEntries.length,7);
 assert.equal(new Set(fiscalKybPreparationEntries.map(x=>x.id)).size,7);
 assert.ok(fiscalKybPreparationEntries.every(x=>x.title&&x.preparation&&x.privacy));
 assert.ok(Object.isFrozen(fiscalKybPreparationEntries));
 assert.ok(fiscalKybPreparationEntries.every(Object.isFrozen));
});
test("manual preparation never submits, persists, approves or permits issuance",()=>{
 const ids=fiscalKybPreparationEntries.map(x=>x.id);
 for(let length=0;length<=7;length++){
  const input=ids.slice(0,length);
  const unmodified=[...input];
  const x=summarizeFiscalKybLocalPreparation(input);
  assert.equal(x.locallyMarked,length);
  assert.equal(x.unmarked,7-length);
  assert.equal(x.submitted,false);
  assert.equal(x.persisted,false);
  assert.equal(x.legalApproval,false);
  assert.equal(x.fiscalIssuanceEnabled,false);
  assert.deepEqual(input,unmodified);
  assert.equal(Object.isFrozen(x),true);
 }
 assert.equal(summarizeFiscalKybLocalPreparation([ids[0],ids[0]]).locallyMarked,1);
 assert.throws(()=>summarizeFiscalKybLocalPreparation(["unknown"] as never),/KYB_PREPARATION_INVALID/);
 assert.throws(()=>summarizeFiscalKybLocalPreparation(Array(8).fill(ids[0])),/KYB_PREPARATION_INVALID/);
});
test("file metadata policy fails closed on names, sizes, MIME and checksums",()=>{
 const valid={filename:"business-proof.pdf",mimeType:"application/pdf",byteLength:4096,sha256:"a".repeat(64)};
 let x=evaluateFiscalKybCandidateFile(valid);
 assert.equal(x.metadataAccepted,true);
 assert.equal(x.mayUpload,false);
 assert.equal(x.mayPersist,false);
 assert.equal(x.requiresMalwareScan,true);
 assert.equal(x.requiresMagicByteCheck,true);
 const invalid=[
  {...valid,filename:"../passport.pdf"},
  {...valid,filename:"business.pdf.exe"},
  {...valid,filename:"bad name.pdf"},
  {...valid,filename:".hidden.pdf"},
  {...valid,filename:"invoice.pdf",mimeType:"image/png"},
  {...valid,byteLength:0},
  {...valid,byteLength:5*1024*1024+1},
  {...valid,byteLength:2.25},
  {...valid,sha256:"g".repeat(64)},
  {...valid,extra:"public"},
  null,
  []
 ];
 for(const v of invalid){
  x=evaluateFiscalKybCandidateFile(v);
  assert.equal(x.metadataAccepted,false);
  assert.equal(x.mayUpload,false);
  assert.equal(x.mayPersist,false);
 }
});
test("even all asserted infrastructure conditions do not allow real document intake",()=>{
 const checklist={
  privateBucketVerified:true,
  tenantPathIsolationVerified:true,
  encryptionAtRestVerified:true,
  malwareQuarantineVerified:true,
  accessAuditVerified:true,
  retentionDeletionApproved:true,
  sensitiveDataLegalBasisReviewed:true,
  incidentResponseDrillPassed:true,
  operatorMfaReviewed:true
 };
 for(const missing of [null,...Object.keys(checklist)]){
  const flags={...checklist};
  if(missing)flags[missing as keyof typeof flags]=false;
  const result=fiscalKybStorageReadiness(flags);
  assert.equal(result.allTechnicalInputsMarked,!missing);
  assert.equal(result.goLiveApprovalConfirmed,false);
  assert.equal(result.acceptingUploads,false);
  assert.equal(result.automaticKybApproval,false);
  assert.equal(result.issuanceEnabled,false);
  assert.ok(Object.isFrozen(result.gates));
 }
 assert.throws(()=>fiscalKybStorageReadiness({} as never),/KYB_STORAGE_GATE_INVALID/);
});

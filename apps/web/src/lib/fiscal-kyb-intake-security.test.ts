import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getFiscalKybIntakeReadiness,assessFiscalKybIntakeCandidate} from "./fiscal-kyb-intake-security.ts";

const org="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const file={filename:"document.pdf",mimeType:"application/pdf",
 byteLength:4096,sha256:"a".repeat(64)};
const candidate={
 selectedOrganizationId:org,sessionOrganizationId:org,
 membershipRole:"owner",organizationStatus:"under_review",
 checkType:"business_registration",metadata:file
};

test("M31 nine independent release gates cannot be inferred from environment",()=>{
 for(const mfa of [false,true])for(const attemptedFlag of [false,true]){
  const result=getFiscalKybIntakeReadiness({
   operatorMfaEnforced:mfa,dangerousUploadFlagDetected:attemptedFlag
  });
  assert.equal(result.controls.length,9);
  assert.equal(new Set(result.controls.map(x=>x.id)).size,9);
  assert.equal(result.unverifiedCount,9);
  assert.ok(result.controls.every(x=>x.state==="not_independently_verified"));
  assert.equal(result.acceptingUploads,false);
  assert.equal(result.canRequestUploadGrant,false);
  assert.equal(result.acceptingDocumentBytes,false);
  assert.equal(result.canOpenQuarantinedEvidence,false);
  assert.equal(result.technicalClaimsIndependentlyVerified,false);
  assert.equal(result.independentLegalApproval,false);
  assert.equal(result.legalFiscalIssuanceEnabled,false);
  assert.equal(result.status,"not_ready");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.controls));
  assert.ok(result.controls.every(Object.isFrozen));
 }
 for(const x of [
  null,{},[],{operatorMfaEnforced:1,dangerousUploadFlagDetected:false},
  {operatorMfaEnforced:true,dangerousUploadFlagDetected:false,uploadApproved:true}
 ]) assert.throws(()=>getFiscalKybIntakeReadiness(x as never),
   /FISCAL_INTAKE_RUNTIME_INVALID/);
});

test("M31 future eligibility checks fail closed even when every metadata input is valid",()=>{
 const valid=assessFiscalKybIntakeCandidate(candidate);
 assert.equal(valid.eligibleForFuturePolicyAssessment,true);
 assert.equal(valid.metadataFormatAccepted,true);
 assert.equal(valid.signedUploadAuthorizationIssued,false);
 assert.equal(valid.mayUpload,false);
 assert.equal(valid.mayPersist,false);
 assert.equal(valid.evidenceApproved,false);
 assert.equal(valid.legalFiscalIssuanceEnabled,false);
 assert.ok(Object.isFrozen(valid));
});

test("M31 rejects cross-tenant, viewer, suspended, unknown check and invalid file",()=>{
 const cases=[
  {...candidate,sessionOrganizationId:other},
  {...candidate,membershipRole:"viewer"},
  {...candidate,organizationStatus:"rejected"},
  {...candidate,organizationStatus:"suspended"},
  {...candidate,checkType:"invalid"},
  {...candidate,metadata:{...file,filename:"../secret.pdf"}},
  {...candidate,metadata:{...file,byteLength:6*1024*1024}}
 ];
 for(const x of cases){
  const r=assessFiscalKybIntakeCandidate(x);
  assert.equal(r.eligibleForFuturePolicyAssessment,false);
  assert.equal(r.mayUpload,false);
  assert.equal(r.mayPersist,false);
 }
 for(const x of [null,[],{}, {...candidate,csrfToken:"untrusted"},
   {...candidate,selectedOrganizationId:3}]){
  if(x&&typeof x==="object"&&!Array.isArray(x)&&
     "selectedOrganizationId" in x&&x.selectedOrganizationId===3){
   const r=assessFiscalKybIntakeCandidate(x);
   assert.equal(r.tenantIsValid,false);continue;
  }
  assert.throws(()=>assessFiscalKybIntakeCandidate(x),
    /FISCAL_INTAKE_CANDIDATE_INVALID/);
 }
});

test("M31 operator route is authenticated, MFA-gated and read-only",()=>{
 const source=readFileSync(new URL("../app/timologio-admin/kyb-intake-readiness/page.tsx",
  import.meta.url),"utf8");
 assert.match(source,/await fiscalAdminActor\(\)/);
 assert.match(source,/isFiscalMfaSatisfied\(actor\)/);
 assert.match(source,/redirect\("\/timologio-admin\/mfa"\)/);
 assert.ok(!/upload\s*\(|FormData|Blob\(|fetch\s*\(|onSubmit|<input\s+type="file"/.test(source));
});

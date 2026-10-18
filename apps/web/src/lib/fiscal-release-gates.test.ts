import test from "node:test";
import assert from "node:assert/strict";
import {evaluateFiscalReleaseGates} from "./fiscal-release-gates.ts";
import type {FiscalReleaseInputs} from "./fiscal-release-gates.ts";

const baseline=():FiscalReleaseInputs=>({
 standalone:true,databaseConfigured:true,databaseReachable:true,
 baselineSchema:true,mfaSchema:true,certificationSchema:true,
 recoverySchema:false,alertSchema:false,receiptSchema:false,reconcileSchema:false,
 registrationEnabled:false,liveMarketplaceSyncEnabled:false,issuanceFlagEnabled:false,
 mfaSetupEnabled:false,mfaEnforced:false,recoveryEnabled:false,
 alertDeliveryEnabled:false,alertWebhookEnabled:false,
 alertReconciliationEnabled:false,emailVerificationEnabled:false
});

test("operational foundation and disabled security extensions do not imply legal permission",()=>{
 const original=baseline();
 const copy=structuredClone(original);
 const x=evaluateFiscalReleaseGates(original);
 assert.equal(x.foundationOperational,true);
 assert.equal(x.configurationHasUnsafeOverrides,false);
 assert.equal(x.releaseAuthorized,false);
 assert.equal(x.legalIssuanceEnabled,false);
 assert.equal(x.externalRegulatoryApprovalConfirmed,false);
 assert.equal(x.gates.find(g=>g.id==="legal_clearance")?.state,"blocked");
 for(const id of ["recovery","security_alerts","reconciliation"]){
  assert.equal(x.gates.find(g=>g.id===id)?.state,"pending");
 }
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.gates),true);
 assert.ok(x.gates.every(Object.isFrozen));
 assert.deepEqual(original,copy);
});
test("all combinations of internal gates fail closed for legal issuance",()=>{
 const sample=baseline();
 const keys=[
  "registrationEnabled","liveMarketplaceSyncEnabled","issuanceFlagEnabled",
  "mfaSetupEnabled","mfaEnforced","recoveryEnabled","alertDeliveryEnabled",
  "alertWebhookEnabled","alertReconciliationEnabled","emailVerificationEnabled"
 ] as const;
 for(const key of keys){
  for(const value of [false,true]){
   const x=evaluateFiscalReleaseGates({...sample,[key]:value});
   assert.equal(x.releaseAuthorized,false);
   assert.equal(x.legalIssuanceEnabled,false);
  }
 }
});
test("wrongly enabled legal issuance, registration or marketplace sync is a blocker",()=>{
 for(const key of ["issuanceFlagEnabled","registrationEnabled","liveMarketplaceSyncEnabled"] as const){
  const x=evaluateFiscalReleaseGates({...baseline(),[key]:true});
  assert.equal(x.configurationHasUnsafeOverrides,true);
  assert.equal(x.releaseAuthorized,false);
  assert.equal(x.gates.some(g=>g.state==="blocked"&&g.id!=="legal_clearance"),true);
 }
});
test("absent independent database or schema does not claim foundation operational",()=>{
 for(const key of ["standalone","databaseConfigured","databaseReachable","baselineSchema","mfaSchema","certificationSchema"] as const){
  const x=evaluateFiscalReleaseGates({...baseline(),[key]:false});
  assert.equal(x.foundationOperational,false);
  assert.equal(x.releaseAuthorized,false);
 }
});
test("schema-independent security activation is identified as unsafe",()=>{
 const scenarios:Partial<FiscalReleaseInputs>[]=[
  {mfaSchema:false,mfaEnforced:true},
  {recoveryEnabled:true,recoverySchema:false,mfaEnforced:true},
  {recoveryEnabled:true,recoverySchema:true,mfaEnforced:false},
  {alertDeliveryEnabled:true,alertSchema:false,receiptSchema:false},
  {alertWebhookEnabled:true,alertSchema:false,receiptSchema:false},
  {alertReconciliationEnabled:true,reconcileSchema:false}
 ];
 for(const values of scenarios){
  const x=evaluateFiscalReleaseGates({...baseline(),...values});
  assert.equal(x.configurationHasUnsafeOverrides,true);
  assert.equal(x.releaseAuthorized,false);
 }
});
test("even complete synthetic schema and all positive flags never authorize real invoices",()=>{
 const inputs={...baseline(),
  recoverySchema:true,alertSchema:true,receiptSchema:true,reconcileSchema:true,
  mfaSetupEnabled:true,mfaEnforced:true,recoveryEnabled:true,
  alertDeliveryEnabled:true,alertWebhookEnabled:true,alertReconciliationEnabled:true,
  emailVerificationEnabled:true
 };
 const x=evaluateFiscalReleaseGates(inputs);
 assert.equal(x.foundationOperational,true);
 assert.equal(x.releaseAuthorized,false);
 assert.equal(x.legalIssuanceEnabled,false);
});

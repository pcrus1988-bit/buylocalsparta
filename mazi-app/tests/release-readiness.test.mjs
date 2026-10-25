import test from "node:test";
import assert from "node:assert/strict";
import {assessMaziReleaseReadiness} from "../../apps/web/src/lib/mazi-readiness.ts";

const baseline=()=>({
 interest_total:0,interest_pending:0,interest_approved:0,interest_registry_stale:0,
 invitations_total:0,invitations_delivery_unconfirmed:0,invitations_delivery_failed:0,
 invitations_expired_unconsumed:0,invitations_active:0,invitations_consumed:0,
 acceptances:0,members_total:0,members_kyb_verified:0,members_voting_eligible:0,
 members_suspended:0,proposals_total:0,ballots_total:0,audit_events_total:0,
 ledger_total:0,grant_offers_total:0,finance_enabled_cycles:0,safe_founding_cycles:1,
 last_audit_at:null
});
const completeChecks=()=>["auth_email_delivery","legal_and_retention","consenting_business_e2e"]
 .map((gate_key,i)=>({
  id:String(i+1),gate_key,decision:"verified",
  recorded_at:new Date("2026-10-24T08:00:00Z"),evidence:"External real evidence held securely"
 }));

test("empty live programme cannot pass launch readiness, even with human claims",()=>{
 const result=assessMaziReleaseReadiness(baseline(),completeChecks());
 assert.equal(result.prerequisitesRecorded,false);
 assert.equal(result.realBusinessAdmissionObserved,false);
 assert.equal(result.financeLocked,true);
 assert.equal(result.manualReleaseStillRequired,true);
 assert.match(result.blockers.join(" "),/πραγματική αποδοχή/);
});

test("documented human gates and actual verified member permit only manual release review",()=>{
 const state={...baseline(),acceptances:1,invitations_consumed:1,
  invitations_total:1,members_total:1,members_kyb_verified:1};
 const result=assessMaziReleaseReadiness(state,completeChecks());
 assert.equal(result.prerequisitesRecorded,true);
 assert.equal(result.blockers.length,0);
 assert.equal(result.evidenceGatesVerified,3);
 assert.equal(result.manualReleaseStillRequired,true);
});

test("latest reopened review wins and invalidates recorded readiness",()=>{
 const state={...baseline(),acceptances:1,invitations_consumed:1,
  members_total:1,members_kyb_verified:1};
 const reviews=[...completeChecks(),{
  id:"4",gate_key:"legal_and_retention",decision:"reopened",
  recorded_at:new Date("2026-10-24T08:00:00Z"),evidence:"New evidence makes the earlier approval invalid"
 }];
 const result=assessMaziReleaseReadiness(state,reviews);
 assert.equal(result.evidenceGatesVerified,2);
 assert.equal(result.prerequisitesRecorded,false);
 assert.match(result.blockers.join(" "),/νομικός έλεγχος/);
});

test("financial activation, provider failures and acceptance mismatches always block",()=>{
 const state={...baseline(),acceptances:1,invitations_consumed:2,
  invitations_delivery_failed:1,ledger_total:1,members_kyb_verified:1};
 const result=assessMaziReleaseReadiness(state,completeChecks());
 assert.equal(result.prerequisitesRecorded,false);
 assert.equal(result.financeLocked,false);
 assert.equal(result.invitationAuditCoherent,false);
 assert.equal(result.admissionExceptions,1);
 assert.ok(result.blockers.length>=3);
});

test("duplicate human records cannot increase the number of required gates",()=>{
 const records=[...completeChecks(),{
  id:"5",gate_key:"auth_email_delivery",decision:"verified",
  recorded_at:new Date("2026-10-24T09:00:00Z"),evidence:"Updated confirmation"
 }];
 const result=assessMaziReleaseReadiness(baseline(),records);
 assert.equal(result.evidenceGatesVerified,3);
 assert.equal(result.evidenceGatesTotal,3);
 assert.equal(result.manualReleaseStillRequired,true);
});

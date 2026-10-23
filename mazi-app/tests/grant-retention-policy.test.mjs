import test from "node:test";
import assert from "node:assert/strict";
import {
  MAZI_MONTHLY_GRANT_BASIS_CENTS, MAZI_RETENTION_POLICY_VERSION,
  grantCommitmentMonths,monthsBeforeRepeatApplication,addCalendarMonths,
  projectGrantCommitment,canApplyAfterGrant,firstTimeSupportRequest,
  cancellationDeadlineForMonth,earliestMembershipCancellationEnd
} from "../lib/grant-retention-policy.ts";

test("requested amount divided by 40% of €250, rounded UP",()=>{
  assert.equal(MAZI_MONTHLY_GRANT_BASIS_CENTS,10000);
  for(const [euros,months] of [[500,5],[1000,10],[2500,25],[5000,50],[10000,100],[10001,101],[200000,2000]]) {
    assert.equal(grantCommitmentMonths(euros*100),months);
  }
  assert.equal(grantCommitmentMonths(10001),2); // €100.01
  assert.throws(()=>grantCommitmentMonths(0),RangeError);
  assert.throws(()=>grantCommitmentMonths(-100),RangeError);
  assert.throws(()=>grantCommitmentMonths(0.2),RangeError);
});

test("80% commitment must pass before applying again; ceil to full months",()=>{
  for(const [months,delay] of [[1,1],[2,2],[5,4],[6,5],[10,8],[25,20],[50,40],[100,80]]) {
    assert.equal(monthsBeforeRepeatApplication(months),delay);
  }
  assert.throws(()=>monthsBeforeRepeatApplication(0),RangeError);
});

test("calendar dates preserve month-end and leap days",()=>{
  assert.equal(addCalendarMonths("2026-01-31",1),"2026-02-28");
  assert.equal(addCalendarMonths("2028-01-31",1),"2028-02-29");
  assert.equal(addCalendarMonths("2026-01-30",2),"2026-03-30");
  assert.equal(addCalendarMonths("2026-01-31",2),"2026-03-31");
  assert.throws(()=>addCalendarMonths("2026-02-30",1),RangeError);
});

test("projections are advisory, and reapplication is anchored to actual grant date",()=>{
  const plan=projectGrantCommitment(500000,"2026-10-23");
  assert.equal(plan.policyVersion,MAZI_RETENTION_POLICY_VERSION);
  assert.equal(plan.additionalMonths,50);
  assert.equal(plan.repeatApplicationDelayMonths,40);
  assert.equal(plan.committedThrough,"2030-12-23");
  assert.equal(plan.earliestRepeatApplicationDate,"2030-02-23");
  assert.equal(plan.illustrativeFeeCommitmentCents,1250000);
  assert.equal(canApplyAfterGrant("2030-02-22",plan),false);
  assert.equal(canApplyAfterGrant("2030-02-23",plan),true);
  assert.equal(canApplyAfterGrant("2026-10-23",null),true);
});

test("subsequent grants extend beyond an existing commitment without overlap",()=>{
  const initial=projectGrantCommitment(100000,"2026-10-23");
  const next=projectGrantCommitment(50000,"2027-06-23",initial.committedThrough);
  assert.equal(initial.committedThrough,"2027-08-23");
  assert.equal(next.periodStart,"2027-08-23");
  assert.equal(next.committedThrough,"2028-01-23");
  assert.equal(next.earliestRepeatApplicationDate,"2027-12-23");
});

test("first-time priority is only for the FIRST submitted support request",()=>{
  assert.equal(firstTimeSupportRequest(0),true);
  assert.equal(firstTimeSupportRequest(1),false);
  assert.equal(firstTimeSupportRequest(20),false);
  assert.throws(()=>firstTimeSupportRequest(-1),RangeError);
});

test("ordinary membership cancels at month end if notice is >=10 days before",()=>{
  assert.equal(cancellationDeadlineForMonth("2026-10"),"2026-10-21");
  assert.equal(earliestMembershipCancellationEnd("2026-10-21"),"2026-10-31");
  assert.equal(earliestMembershipCancellationEnd("2026-10-22"),"2026-11-30");
  assert.equal(cancellationDeadlineForMonth("2028-02"),"2028-02-19");
  assert.equal(earliestMembershipCancellationEnd("2028-02-19"),"2028-02-29");
  assert.equal(earliestMembershipCancellationEnd("2028-02-20"),"2028-03-31");
});

test("approved grant commitment limits effective cancellation but cannot hide notice",()=>{
  assert.equal(earliestMembershipCancellationEnd("2026-10-20","2028-06-15"),"2028-06-30");
  assert.equal(earliestMembershipCancellationEnd("2026-10-22","2026-11-01"),"2026-11-30");
});


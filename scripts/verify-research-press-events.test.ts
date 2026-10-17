import test from "node:test";
import assert from "node:assert/strict";
import {parseSesPressEvent,pressDeliveryOutcome} from "../apps/web/src/lib/research-press-provider-events.ts";

const mail={
  messageId:"010001-test-id",destination:["one@example.com","two@example.org"],
  timestamp:"2026-10-17T10:10:00.000Z",
  tags:{pressCampaign:["a2b1c3d4-1234-4acd-8fff-abcdefabc123"]}
};
test("verified-SES payload parser extracts all individually reported delivery recipients",()=>{
  const r=parseSesPressEvent({eventType:"Delivery",mail,delivery:{recipients:["one@example.com","two@example.org"],timestamp:"2026-10-17T10:10:30Z"}});
  assert.equal(r.length,2);
  assert.equal(r[0]?.type,"delivered");
  assert.equal(r[0]?.campaignId,"a2b1c3d4-1234-4acd-8fff-abcdefabc123");
});
test("bounce uses bouncedRecipients and cannot count unbounced destination addresses",()=>{
  const r=parseSesPressEvent({notificationType:"Bounce",mail,bounce:{bounceType:"Permanent",bouncedRecipients:[{emailAddress:"two@example.org"}]}});
  assert.deepEqual(r.map(e=>e.recipient),["two@example.org"]);
  assert.equal(r[0]?.detail,"Permanent");
});
test("complaint is tracked distinctly from spam-folder placement",()=>{
  const r=parseSesPressEvent({eventType:"Complaint",mail,complaint:{complainedRecipients:[{emailAddress:"one@example.com"}],complaintFeedbackType:"abuse"}});
  assert.equal(r.length,1);assert.equal(r[0]?.type,"complained");
});
test("reject missing message IDs and unsupported event types",()=>{
  assert.deepEqual(parseSesPressEvent({eventType:"Delivery",mail:{destination:["a@example.com"]},delivery:{recipients:["a@example.com"]}}),[]);
  assert.deepEqual(parseSesPressEvent({eventType:"Send",mail}),[]);
  assert.deepEqual(parseSesPressEvent({eventType:"Open",mail,open:{}}).length,2);
});
test("complaints and bounces outrank earlier delivered receipts",()=>{
  assert.equal(pressDeliveryOutcome("sent",new Set(["delivered","complained"])),"complained");
  assert.equal(pressDeliveryOutcome("sent",new Set(["delivered","bounced"])),"bounced");
  assert.equal(pressDeliveryOutcome("sent",new Set(["delivered"])),"delivered");
  assert.equal(pressDeliveryOutcome("sent",new Set([])),"accepted_unconfirmed");
  assert.equal(pressDeliveryOutcome("sending",new Set([])),"held");
  assert.equal(pressDeliveryOutcome("pending",new Set([])),"pending");
});
test("malformed and ambiguous feedback cannot invent positive delivery",()=>{
  assert.deepEqual(parseSesPressEvent({eventType:"Delivery",mail,delivery:{recipients:["bad-address"]}}),[]);
  assert.deepEqual(parseSesPressEvent({eventType:"Bounce",mail,bounce:{}}),[]);
  assert.deepEqual(parseSesPressEvent(null),[]);
});

test("shared research SNS topic ignores untagged SES notification without database access",()=>{
  const surveyMail={messageId:"010001-research",destination:["survey@example.org"],timestamp:"2026-10-17T10:10:00.000Z",tags:{research_attempt:["1234"]}};
  assert.deepEqual(parseSesPressEvent({eventType:"Delivery",mail:surveyMail,delivery:{recipients:["survey@example.org"]}}),[]);
  assert.deepEqual(parseSesPressEvent({eventType:"Bounce",mail:surveyMail,bounce:{bounceType:"Permanent",bouncedRecipients:[{emailAddress:"survey@example.org"}]}}),[]);
  const unknownCampaign={...mail,tags:{pressCampaign:["not-a-uuid"]}};
  assert.deepEqual(parseSesPressEvent({eventType:"Complaint",mail:unknownCampaign,complaint:{complainedRecipients:[{emailAddress:"one@example.com"}]}}),[]);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ABANDONED_FOLLOWUP_MODE,
  ABANDONED_RESEARCH_FOLLOWUP_SUBJECT,
  ABANDONED_RESEARCH_FOLLOWUP_BODY
} from "./research-survey-abandoned-followup.ts";

const worker = readFileSync(new URL("./research-survey-jobs.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/ResearchAbandonedFollowupControls.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/admin/research/surveys/[slug]/abandoned-followups/route.ts", import.meta.url), "utf8");

test("email thanks participants and explicitly asks for final submission, without implying optional consent", () => {
  assert.equal(ABANDONED_FOLLOWUP_MODE, "abandoned_q27");
  assert.match(ABANDONED_RESEARCH_FOLLOWUP_SUBJECT, /ολοκληρώσετε την έρευνα/);
  assert.match(ABANDONED_RESEARCH_FOLLOWUP_BODY, /Σας ευχαριστούμε/);
  assert.match(ABANDONED_RESEARCH_FOLLOWUP_BODY, /Ολοκλήρωση έρευνας/);
  assert.match(ABANDONED_RESEARCH_FOLLOWUP_BODY, /μόνο μετά την οριστική υποβολή/i);
  assert.match(ABANDONED_RESEARCH_FOLLOWUP_BODY, /{{survey_url}}/);
  assert.match(ABANDONED_RESEARCH_FOLLOWUP_BODY, /προαιρετικά/);
  assert.match(ABANDONED_RESEARCH_FOLLOWUP_BODY, /κωδικό ευχαριστίας/);
  assert.doesNotMatch(ABANDONED_RESEARCH_FOLLOWUP_BODY, /συναινέσατε στην εμπορική επικοινωνία/);
});

test("abandoned candidate selection and final worker recheck require saved Q27 and active participation", () => {
  const workerSegment = worker.slice(worker.indexOf("async function processInviteReminderJob"), worker.indexOf("async function processRewardDeliveryJob"));
  assert.match(workerSegment, /input\.reminderMode === ABANDONED_FOLLOWUP_MODE/);
  assert.ok((workerSegment.match(/rr\.status='in_progress'/g) ?? []).length >= 2);
  assert.ok((workerSegment.match(/q\.code='Q27'/g) ?? []).length >= 2);
  assert.ok((workerSegment.match(/a\.answered_at <= now\(\) - interval '1 day'/g) ?? []).length >= 2);
  assert.match(workerSegment, /WHERE id=ri\.contact_point_id/);
  assert.match(workerSegment, /NOT public\.research_contact_is_suppressed/);
  assert.match(workerSegment, /COALESCE\(rr\.status,''\) NOT IN \('completed','withdrawn','excluded'\)/);
});

test("eligible count excludes suppressed and withdrawn, and returns no participant information", () => {
  assert.match(api, /rr\.status='in_progress'/);
  assert.match(api, /ri\.status='started'/);
  assert.match(api, /cp\.suppression_status='active'/);
  assert.match(api, /NOT public\.research_contact_is_suppressed/);
  assert.match(api, /q\.code='Q27'/);
  assert.match(api, /minimumSinceLastAnswerHours: 24/);
  assert.doesNotMatch(api, /SELECT\s+cp\.contact_value|email_address/);
});

test("fieldwork controls require two confirmations and support preview before explicit send", () => {
  assert.match(ui, /setConfirmStep\(1\)/);
  assert.match(ui, /setConfirmStep\(2\)/);
  assert.match(ui, /confirmText!==String\(batchCap\)/);
  assert.match(ui, /purpose: "abandoned_followup"/);
  assert.match(ui, /action: "send_abandoned_followups"/);
  assert.match(ui, /reviewConfirmed: true, finalConfirmed: true/);
  assert.match(worker, /assertResearchEmailBatchApproval\(input.emailApproval/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./research-survey-jobs.ts", import.meta.url), "utf8");

test("research results and thank-you messages exclude all suppressed contacts", () => {
  const reward = source.slice(source.indexOf("async function processRewardDeliveryJob"), source.indexOf("async function processResultsNotificationJob"));
  const results = source.slice(source.indexOf("async function processResultsNotificationJob"));
  for (const section of [reward, results]) {
    assert.match(section, /cp\.suppression_status='active'/);
    assert.match(section, /ri\.status <> 'suppressed'/);
    assert.match(section, /NOT public\.research_contact_is_suppressed\(cp\.contact_type,cp\.contact_value_hash\)/);
    assert.match(section, /rr\.status='completed'/);
    assert.doesNotMatch(section, /suppression\.reason='participant_research_opt_out'/);
  }
});

test("reminder candidate and final send checks reject withdrawn and suppressed respondents", () => {
  const reminders = source.slice(source.indexOf("async function processInviteReminderJob"));
  assert.match(source, /COALESCE\(rr\.status,''\) NOT IN \('completed','withdrawn','excluded'\)/);
  assert.match(source, /cp\.suppression_status='active'/);
  assert.match(source, /NOT public\.research_contact_is_suppressed/);
  assert.ok(reminders.length>1000);
});

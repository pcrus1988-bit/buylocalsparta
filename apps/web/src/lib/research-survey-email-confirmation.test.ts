import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const jobsSource = readFileSync(new URL("./research-survey-jobs.ts", import.meta.url), "utf8");
const fieldworkSource = readFileSync(new URL("../components/ResearchStudyFieldworkControls.tsx", import.meta.url), "utf8");

test("thank-you delivery checks the real study title for two-step email approval", () => {
  const start = jobsSource.indexOf("export async function queueGreekRetailRewardDelivery");
  const end = jobsSource.indexOf("export async function queueGreekRetailResultsNotifications", start);
  assert.ok(start > 0 && end > start, "reward queue function must exist");
  const rewardQueue = jobsSource.slice(start, end);
  assert.match(rewardQueue, /SELECT id,title,status,current_wave_id FROM research_studies WHERE slug=\$1 LIMIT 1/);
  assert.match(rewardQueue, /studyTitle: text\(row\.title\)/);
  assert.match(rewardQueue, /purpose: "thank_you_code"/);
  assert.match(rewardQueue, /maxEmails: limit/);
});

test("failed email confirmation is visible inside the modal, not only behind it", () => {
  assert.match(fieldworkSource, /setConfirmationError\(displayedError\)/);
  assert.match(fieldworkSource, /confirmationError && <div role="alert"/);
  assert.match(fieldworkSource, /disabled=\{Boolean\(busy\) \|\| confirmationText\.trim\(\) !== String\(pendingEmail\.maxEmails\)\}/);
});

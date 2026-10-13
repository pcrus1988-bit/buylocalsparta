import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ledger = readFileSync(new URL("./research-survey-consent-directory.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/ResearchStudyConsentDirectory.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/research/surveys/[slug]/[section]/page.tsx", import.meta.url), "utf8");

test("consent history uses the latest recorded choice, not an assumed questionnaire timestamp", () => {
  assert.match(ledger, /DISTINCT ON \(rc\.response_id,rc\.consent_kind\)/);
  assert.match(ledger, /ORDER BY rc\.response_id,rc\.consent_kind,rc\.occurred_at DESC,rc\.id DESC/);
  assert.match(ledger, /WHERE \(\$3::boolean IS NULL OR granted=\$3\)/);
  assert.match(ledger, /prior\.granted=true/);
  assert.doesNotMatch(ledger, /rr\.status\s*=\s*'completed'/);
  assert.match(ui, /timeZone: "Europe\/Athens"/);
  assert.match(ui, /row\.lastOptInAt/);
});

test("consent contact identities are permission-gated, page-limited and audited", () => {
  assert.match(ledger, /hasAdminPermission\(principal, "research\.privacy\.manage"\)/);
  assert.match(ledger, /hasAdminPermission\(principal, "research\.fieldwork\.manage"\)/);
  assert.match(ledger, /hasAdminPermission\(principal, "research\.manage"\)/);
  assert.match(ledger, /page AS MATERIALIZED/);
  assert.match(ledger, /ORDER BY occurred_at DESC,id DESC LIMIT 26/);
  assert.match(ledger, /canViewEmail\s*\? "pv\.contact_value AS email" : "NULL::text AS email"/);
  assert.match(ledger, /research_private\.contact_vault/);
  assert.match(ledger, /recordAdminPersonalDataAccess\(/);
  assert.match(ui, /Μη διαθέσιμο \/ έχει διαγραφεί/);
});

test("consent page is a lightweight study-wide fast path with filters and pagination", () => {
  assert.match(page, /if \(section === "consent"\)/);
  assert.match(page, /researchSurveyAdminFastOverview\(principal, slug\)/);
  assert.match(page, /researchSurveyConsentDirectory\(principal, slug,/);
  assert.match(ui, /name="kind"/);
  assert.match(ui, /name="decision"/);
  assert.match(ui, /nextCursor/);
});

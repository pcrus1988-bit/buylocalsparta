import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("packages/postgres-runtime/src/mydata.ts", "utf8");
const page = readFileSync("apps/web/src/app/admin/tax/page.tsx", "utf8");

test("tax register includes bounded historical manual-review exceptions alongside recent documents", () => {
  const start = workspace.indexOf("async workspace(");
  const end = workspace.indexOf("async connectivityCheck(", start);
  assert.ok(start >= 0 && end > start, "expected the admin tax workspace");
  const query = workspace.slice(start, end);
  assert.match(query, /ORDER BY created_at DESC, id DESC LIMIT 250/);
  assert.match(query, /WHERE transmission_status='manual_review' AND aade_mark IS NULL/);
  assert.match(query, /ORDER BY created_at DESC, id DESC LIMIT 100/);
  assert.match(query, /UNION/);
  assert.match(query, /ORDER BY td.created_at DESC, td.id DESC/);
});

test("tax dashboard explicitly distinguishes unnumbered accountant reviews from numbered AADE reconciliation", () => {
  assert.match(page, /const unnumberedManualReviewDocuments/);
  assert.match(page, /!document.documentNumber && !document.aadeMark/);
  assert.match(page, /require accountant review/);
  assert.match(page, /They are excluded from automatic retry/);
  assert.match(page, /Latest 250 fiscal documents plus up to 100 older unresolved manual-review/);
});

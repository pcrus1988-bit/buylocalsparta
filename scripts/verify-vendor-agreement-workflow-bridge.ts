import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(path, "utf8");
const hub = read("apps/web/src/app/admin/applications/actions.ts");
const sparta = read("packages/postgres-runtime/src/admin-operations-live.ts");
const cards = read("apps/web/src/app/admin/applications/page.tsx");
const finance = read("apps/web/src/app/api/admin/finance/agreements/route.ts");
const preview = read("apps/web/src/app/api/admin/finance/agreements/plan-preview/route.ts");
const claim = read("apps/web/src/app/hubs/claim/[id]/page.tsx");
const plan = read("apps/web/src/lib/vendor-plan-agreements.ts");

for (const item of [
  "hub_expansion_prospects h ON h.vendor_id=a.vendor_id",
  "a.terms_snapshot->>'planMarket'='expansion_hubs'",
  "a.terms_snapshot->>'planCode'=h.plan_code",
  "a.terms_snapshot->>'billingCycle'=h.billing_cycle",
  "a.terms_snapshot->>'legalReviewStatus'='approved'",
  "a.signed_pdf_object_key IS NOT NULL",
  "a.govgr_verified_at IS NOT NULL",
  "HUB_CONVERSION_REQUIRES_APPROVED_SIGNED_PLAN_AGREEMENT"
]) assert.ok(hub.includes(item), "HUB conversion missing agreement gate: " + item);
for (const item of [
  "a.requested_plan_code",
  "terms.planMarket!==\"sparta\"",
  "terms.planCode!==row.requested_plan_code",
  "terms.legalReviewStatus!==\"approved\"",
  "verifiedForFinalActivation",
  "2026-10-11T00:00:00.000Z"
]) assert.ok(sparta.includes(item), "Sparta merchant activation missing plan gate: " + item);
assert.ok(cards.includes("Plan agreement PDF"), "HUB applications must link to plan-specific draft");
assert.ok(cards.includes("Plan agreement PDF ↗"), "Sparta applications must link to plan-specific draft");
assert.ok(cards.includes("Finance · Governed agreement"), "Admin must offer official contract lifecycle");
assert.ok(finance.includes("assertAgreementApprovedForSigning"), "Finance must reject pending legal templates");
assert.ok(preview.includes("Requested agreement plan or billing cycle does not match"), "Preview must reject another plan/cycle");
assert.ok(claim.includes('formData.get("publishConsent")'), "CLAIM publication consent required");
assert.ok(!claim.includes("merchant agreement accepted"), "CLAIM must not claim merchant-contract acceptance");
assert.ok(plan.includes('VENDOR_AGREEMENT_LEGAL_STATUS = "approved"'),
  "Reviewed terms must use new approved immutable version");
console.log("Vendor agreements: plan-matched HUB + Sparta activation gates, admin draft visibility and CLAIM directory separation OK.");

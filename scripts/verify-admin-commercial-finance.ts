import { existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const failures: string[] = [];
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const requireText = (path: string, requirements: readonly string[]) => {
  if (!existsSync(`${root}/${path}`)) { failures.push(`Missing ${path}`); return; }
  const source = read(path);
  for (const requirement of requirements) if (!source.includes(requirement)) failures.push(`${path} is missing ${requirement}`);
};

const financeTabsPath = "apps/web/src/components/AdminFinanceTabs.tsx";
requireText(financeTabsPath, [
  "/admin/finance", "/admin/finance/vendor-billing", "/admin/tax",
  "Payables & Settlements", "sort((a, b) => b.href.length - a.href.length)", 'aria-current={current?.href === tab.href ? "page" : undefined}'
]);
const financeTabs = read(financeTabsPath);
if (financeTabs.includes("/admin/finance/agreements")) failures.push("Finance tabs must not claim Partner Agreements");
if (financeTabs.includes("/admin/finance/agreements/sla")) failures.push("Finance tabs must not claim Partner SLA policies");

requireText("apps/web/src/lib/workspace-navigation.ts", [
  '{ label: "Εμπορικές συμφωνίες", href: "/admin/finance/agreements"',
  '{ label: "SLA συμφωνιών", href: "/admin/finance/agreements/sla"',
  '{ label: "Οικονομική επισκόπηση", href: "/admin/finance"',
  '{ label: "Vendor Billing", href: "/admin/finance/vendor-billing"',
  '{ label: "Tax & myDATA", href: "/admin/tax"'
]);

requireText("apps/web/src/app/admin/finance/page.tsx", [
  "Finance attention", "Payables & settlements", "Settlement workflow", "Secondary controls",
  "Partner agreements", "Tax & myDATA", "Vendor Billing", "Maker / checker", "/api/admin/finance/settlement",
  "admin-finance-workflow-grid", "admin-finance-disclosure"
]);
requireText("apps/web/src/app/admin/finance/agreements/sla/page.tsx", ["Partner operations · SLA", "AdminSlaPoliciesClient"]);
requireText("apps/web/src/app/admin/finance/agreements/page.tsx", [
  "Partner governance · commercial terms", "admin-split-workspace", "admin-directory-table", "AdminStatusStack", "Selected agreement",
  "Governed agreement lifecycle & create new agreement", "AdminCommercialAgreementsClient", "gov.gr reference", "Open Partner record"
]);
requireText("apps/web/src/app/admin/finance/vendor-billing/page.tsx", [
  "admin-split-workspace", "admin-directory-table", "AdminStatusStack", "Selected invoice",
  "Governed billing actions & create billing draft", "VendorBillingClient", "Ready for AADE", "MARK", "UID", "Draft ≠ fiscal issuance", "Open Partner record"
]);
for (const path of [
  "apps/web/src/app/admin/finance/page.tsx",
  "apps/web/src/app/admin/finance/vendor-billing/page.tsx",
  "apps/web/src/app/admin/finance/agreements/page.tsx",
  "apps/web/src/app/admin/finance/agreements/sla/page.tsx"
]) {
  if (read(path).includes("AdminFinanceTabs")) failures.push(`${path} must use the Admin context navigation instead of duplicate Finance tabs`);
}
requireText("apps/web/src/components/AdminCommercialAgreementsClient.tsx", [
  'fetch("/api/admin/finance/agreements"', 'action: "verify_govgr"', 'action: "activate"', '"signed_upload"', 'action: "email_pdf"'
]);
requireText("apps/web/src/components/VendorBillingClient.tsx", [
  'fetch("/api/admin/finance/vendor-billing"', 'action(inv.id,"prepare"', 'action(inv.id,"transmit")', 'action(inv.id,"email")', "approvedPayments"
]);
requireText("apps/web/src/app/admin-commercial-finance.css", [".admin-commercial-controls", ".admin-directory-row.is-selected", ".admin-split-workspace>.admin-directory-table"]);
requireText("apps/web/src/app/admin-finance-operational.css", [".admin-finance-workflow-grid", ".admin-finance-workflow-card", ".admin-finance-disclosure"]);
requireText("apps/web/src/app/layout.tsx", ['import "./admin-commercial-finance.css"']);
requireText("apps/web/src/app/admin/layout.tsx", ['import "../admin-finance-operational.css"']);

if (failures.length) {
  console.error("Admin commercial finance checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Admin commercial finance checks passed: Finance owns payables/settlements, billing and tax hand-offs; Partner Agreements/SLA keep commercial ownership; duplicate local navigation is removed; governed lifecycle endpoints remain unchanged.");

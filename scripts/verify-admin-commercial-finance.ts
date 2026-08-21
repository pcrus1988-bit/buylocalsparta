import { existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const failures: string[] = [];
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const requireText = (path: string, requirements: readonly string[]) => {
  if (!existsSync(`${root}/${path}`)) { failures.push(`Missing ${path}`); return; }
  const source = read(path);
  for (const requirement of requirements) if (!source.includes(requirement)) failures.push(`${path} is missing ${requirement}`);
};

requireText("apps/web/src/components/AdminFinanceTabs.tsx", [
  "/admin/finance", "/admin/finance/vendor-billing", "/admin/finance/agreements", "/admin/finance/agreements/sla", "/admin/tax",
  "sort((a, b) => b.href.length - a.href.length)", 'aria-current={current?.href === tab.href ? "page" : undefined}'
]);
requireText("apps/web/src/app/admin/finance/page.tsx", ["AdminFinanceTabs", "Maker / checker", "/api/admin/finance/settlement"]);
requireText("apps/web/src/app/admin/finance/agreements/sla/page.tsx", ["AdminFinanceTabs", "AdminSlaPoliciesClient"]);
requireText("apps/web/src/app/admin/finance/agreements/page.tsx", [
  "AdminFinanceTabs", "admin-split-workspace", "admin-directory-table", "AdminStatusStack", "Selected agreement",
  "Governed agreement lifecycle & create new agreement", "AdminCommercialAgreementsClient", "gov.gr reference", "Open Partner record"
]);
requireText("apps/web/src/app/admin/finance/vendor-billing/page.tsx", [
  "AdminFinanceTabs", "admin-split-workspace", "admin-directory-table", "AdminStatusStack", "Selected invoice",
  "Governed billing actions & create billing draft", "VendorBillingClient", "Ready for AADE", "MARK", "UID", "Draft ≠ fiscal issuance", "Open Partner record"
]);
requireText("apps/web/src/components/AdminCommercialAgreementsClient.tsx", [
  'fetch("/api/admin/finance/agreements"', 'action: "verify_govgr"', 'action: "activate"', '"signed_upload"', 'action: "email_pdf"'
]);
requireText("apps/web/src/components/VendorBillingClient.tsx", [
  'fetch("/api/admin/finance/vendor-billing"', 'action(inv.id,"prepare"', 'action(inv.id,"transmit")', 'action(inv.id,"email")', "approvedPayments"
]);
requireText("apps/web/src/app/admin-commercial-finance.css", [".admin-commercial-controls", ".admin-directory-row.is-selected", ".admin-split-workspace>.admin-directory-table"]);
requireText("apps/web/src/app/layout.tsx", ['import "./admin-commercial-finance.css"']);

if (failures.length) {
  console.error("Admin commercial finance checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Admin commercial finance checks passed: shared navigation, scan-first agreement/invoice directories, selected-record context, progressive governed controls and existing lifecycle endpoints verified.");

import { existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];

const quickLinks = "apps/web/src/components/WorkspaceQuickLinks.tsx";
if (!existsSync(`${root}/${quickLinks}`)) failures.push("Missing shared workspace quick-link component");
else {
  const source = read(quickLinks);
  if (!source.includes('from "next/link"')) failures.push("Workspace quick links must use Next Link");
  if (!source.includes("workspace-quick-card")) failures.push("Workspace quick links need a consistent interactive card affordance");
}

for (const [name, path, rootRoute, expectedGroups] of [
  ["Vendor", "apps/web/src/components/VendorWorkspaceHeader.tsx", "/vendor", ["Operations", "Business"]],
  ["Admin", "apps/web/src/components/AdminWorkspaceHeader.tsx", "/admin", ["Operations", "Commerce", "Trust", "Intelligence"]]
] as const) {
  const source = read(path);
  if (!source.includes("usePathname")) failures.push(`${name} workspace navigation is missing route awareness`);
  if (!source.includes("aria-expanded={menuOpen}")) failures.push(`${name} workspace navigation is missing an accessible mobile disclosure`);
  if (!source.includes("workspace-menu-toggle")) failures.push(`${name} workspace navigation is missing its mobile menu control`);
  if (!source.includes('aria-current={active ? "page"')) failures.push(`${name} workspace navigation is missing accessible active state`);
  if (!source.includes('from "next/link"')) failures.push(`${name} workspace navigation must use Next Link`);
  if (!source.includes(`href="${rootRoute}"`)) failures.push(`${name} identity must lead to its workspace overview`);
  for (const group of expectedGroups) if (!source.includes(`label: "${group}"`)) failures.push(`${name} workspace is missing ${group} grouping`);
}

const account = read("apps/web/src/components/AccountDashboardClient.tsx");
for (const destination of ["/returns-refunds", "/delivery-pickup", "/privacy-controls", "/ask-local"]) {
  if (!account.includes(`href: "${destination}"`) && !account.includes(`href="${destination}"`)) failures.push(`Account dashboard is missing task path ${destination}`);
}
if (!account.includes("account-snapshot")) failures.push("Account dashboard is missing an at-a-glance status summary");
if (!account.includes("account-section-nav")) failures.push("Account dashboard is missing direct section navigation");
for (const sectionId of ["overview", "orders", "saved", "notifications", "privacy", "recent"]) {
  if (!account.includes(`id="${sectionId}"`)) failures.push(`Account dashboard is missing the ${sectionId} task anchor`);
}
if (!account.includes('role="alert"')) failures.push("Account dashboard mutations need recoverable error feedback");

const vendor = read("apps/web/src/components/VendorDashboardClient.tsx");
for (const destination of ["/vendor/catalog", "/vendor/shipping", "/vendor/returns", "/vendor/trust", "/vendor/advice", "/vendor/finance"]) {
  if (!vendor.includes(`href: "${destination}"`)) failures.push(`Vendor dashboard is missing task path ${destination}`);
}

const admin = read("apps/web/src/app/admin/page.tsx");
for (const destination of ["/admin/vendors", "/admin/matching", "/admin/trust", "/admin/orders", "/admin/finance", "/admin/fairness"]) {
  if (!admin.includes(`href:"${destination}"`)) failures.push(`Admin dashboard is missing priority queue ${destination}`);
}

const css = read("apps/web/src/app/dashboard-ux.css");
for (const selector of [".workspace-header", ".workspace-nav a.is-active", ".workspace-quick-grid", ".account-snapshot"]) {
  if (!css.includes(selector)) failures.push(`Dashboard UX stylesheet is missing ${selector}`);
}

const premiumCssPath = "apps/web/src/app/dashboard-premium.css";
if (!existsSync(`${root}/${premiumCssPath}`)) failures.push("Missing premium dashboard design system");
else {
  const premiumCss = read(premiumCssPath);
  for (const requirement of ["--dash-navy", "--dash-gold", "padding-left: 282px", ".workspace-menu-toggle", ".workspace-header.is-menu-open", ".account-section-nav", ":focus-visible", "@media (max-width: 1020px)"]) {
    if (!premiumCss.includes(requirement)) failures.push(`Premium dashboard design system is missing ${requirement}`);
  }
}

if (!read("apps/web/src/app/layout.tsx").includes('import "./dashboard-premium.css"')) failures.push("Premium dashboard stylesheet is not loaded after the base dashboard styles");

if (failures.length) {
  console.error("Dashboard UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Dashboard UX checks passed: premium responsive navigation, task anchors, status summaries and customer/vendor/admin paths verified.");

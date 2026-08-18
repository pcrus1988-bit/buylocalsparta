import { existsSync, readFileSync } from "node:fs";
import { ADMIN_WORKSPACE_NAVIGATION, VENDOR_WORKSPACE_NAVIGATION, WORKSPACE_PAGE_ROUTES } from "../apps/web/src/lib/workspace-navigation.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];

const quickLinks = "apps/web/src/components/WorkspaceQuickLinks.tsx";
if (!existsSync(`${root}/${quickLinks}`)) failures.push("Missing shared workspace quick-link component");
else {
  const source = read(quickLinks);
  if (!source.includes('from "next/link"')) failures.push("Workspace quick links must use Next Link");
  if (!source.includes("workspace-quick-card")) failures.push("Workspace quick links need a consistent interactive card affordance");
  if (!source.includes('density?: "standard" | "compact"')) failures.push("Workspace quick links must support compact dashboard density");
}

for (const route of WORKSPACE_PAGE_ROUTES) {
  const page = route === "/vendor" ? "apps/web/src/app/vendor/page.tsx" : route === "/admin" ? "apps/web/src/app/admin/page.tsx" : `apps/web/src/app${route}/page.tsx`;
  if (!existsSync(`${root}/${page}`)) failures.push(`Workspace navigation points to missing page ${route}`);
}
if (new Set(WORKSPACE_PAGE_ROUTES).size !== WORKSPACE_PAGE_ROUTES.length) failures.push("Workspace navigation contains duplicate destinations");

const workspaceNavigation = "apps/web/src/components/WorkspaceNavigation.tsx";
if (!existsSync(`${root}/${workspaceNavigation}`)) failures.push("Missing shared collapsible workspace navigation");
else {
  const source = read(workspaceNavigation);
  if (!source.includes("usePathname")) failures.push("Shared workspace navigation is missing route awareness");
  if (!source.includes("<details") || !source.includes("<summary")) failures.push("Workspace navigation groups must be independently collapsible");
  if (!source.includes('aria-current={active ? "page"')) failures.push("Workspace navigation is missing accessible active state");
  if (!source.includes("workspace-link-icon")) failures.push("Workspace navigation must expose compact visual link markers");
  if (!source.includes('from "next/link"')) failures.push("Workspace navigation must use Next Link");
}

for (const [name, path, registry, registryName] of [
  ["Vendor", "apps/web/src/components/VendorWorkspaceHeader.tsx", VENDOR_WORKSPACE_NAVIGATION, "VENDOR_WORKSPACE_NAVIGATION"],
  ["Admin", "apps/web/src/components/AdminWorkspaceHeader.tsx", ADMIN_WORKSPACE_NAVIGATION, "ADMIN_WORKSPACE_NAVIGATION"]
] as const) {
  const source = read(path);
  if (!source.includes("aria-expanded={menuOpen}")) failures.push(`${name} workspace navigation is missing an accessible mobile disclosure`);
  if (!source.includes("workspace-menu-toggle")) failures.push(`${name} workspace navigation is missing its mobile menu control`);
  if (!source.includes("WorkspaceNavigation")) failures.push(`${name} workspace header must use the shared collapsible navigation component`);
  if (!source.includes(registryName)) failures.push(`${name} workspace header must use the canonical workspace navigation registry`);
  for (const group of registry) {
    if (!group.links.length) failures.push(`${name} workspace group ${group.label} cannot be empty`);
    for (const link of group.links) if (!link.icon) failures.push(`${name} workspace link ${link.href} is missing its compact navigation marker`);
  }
}

const vendorHeader = read("apps/web/src/components/VendorWorkspaceHeader.tsx");
if (!vendorHeader.includes('fetch("/api/vendor/session"') || !vendorHeader.includes('fetch("/api/vendor/logout"')) failures.push("Vendor workspace must expose secure logout from every private vendor page");
if (!vendorHeader.includes("x-csrf-token")) failures.push("Vendor workspace logout must preserve CSRF protection");
const vendorDashboard = read("apps/web/src/components/VendorDashboardClient.tsx");
if (vendorDashboard.includes('fetch("/api/vendor/logout"')) failures.push("Vendor logout must not be duplicated in the overview client once the shared header owns it");

const account = read("apps/web/src/components/AccountDashboardClient.tsx");
for (const destination of ["/returns-refunds", "/delivery-pickup", "/privacy-controls", "/ask-local"]) {
  if (!account.includes(`href: "${destination}"`) && !account.includes(`href="${destination}"`)) failures.push(`Account dashboard is missing task path ${destination}`);
}
if (!account.includes("account-snapshot")) failures.push("Account dashboard is missing an at-a-glance status summary");
if (!account.includes("AccountSectionNavigation")) failures.push("Account dashboard must use the comprehensive shared section navigation");
if (!account.includes('density="compact"')) failures.push("Customer dashboard quick actions must use compact premium density");
for (const sectionId of ["overview", "ask-local", "orders", "saved", "notifications", "searches", "recommendations", "privacy", "recent"]) {
  if (!account.includes(`id="${sectionId}"`)) failures.push(`Account dashboard is missing the ${sectionId} task anchor`);
}
if (!account.includes('role="alert"')) failures.push("Account dashboard mutations need recoverable error feedback");

const accountNav = read("apps/web/src/components/AccountSectionNavigation.tsx");
if (!accountNav.includes("account-section-nav")) failures.push("Customer account section navigation is missing its sticky navigation shell");
for (const sectionId of ["overview", "ask-local", "orders", "saved", "notifications", "searches", "recommendations", "privacy", "recent"]) {
  if (!accountNav.includes(`href: "#${sectionId}"`)) failures.push(`Customer account navigation does not expose the real #${sectionId} section`);
}
if (!accountNav.includes("<details") || !accountNav.includes("<summary>Περισσότερα</summary>")) failures.push("Customer account must keep secondary capabilities discoverable without overcrowding the primary navigation");

for (const destination of ["/vendor/catalog", "/vendor/shipping", "/vendor/returns", "/vendor/trust", "/vendor/advice", "/vendor/finance"]) {
  if (!vendorDashboard.includes(`href: "${destination}"`)) failures.push(`Vendor dashboard is missing task path ${destination}`);
}
if (!vendorDashboard.includes('density="compact"')) failures.push("Vendor dashboard quick actions must use compact premium density");

const admin = read("apps/web/src/app/admin/page.tsx");
for (const destination of ["/admin/research-vendors", "/admin/vendors", "/admin/matching", "/admin/trust", "/admin/orders", "/admin/finance"]) {
  if (!admin.includes(`href: "${destination}"`)) failures.push(`Admin dashboard is missing priority queue ${destination}`);
}
if (!admin.includes('density="compact"')) failures.push("Admin dashboard quick actions must use compact premium density");
if (!admin.includes("dashboard-insight-grid")) failures.push("Admin dashboard must keep analytics compact instead of returning to text-heavy summary cards");

const css = read("apps/web/src/app/dashboard-ux.css");
for (const selector of [".workspace-header", ".workspace-nav a.is-active", ".workspace-quick-grid", ".account-snapshot"]) {
  if (!css.includes(selector)) failures.push(`Dashboard UX stylesheet is missing ${selector}`);
}
const premiumCss = read("apps/web/src/app/dashboard-premium.css");
for (const requirement of ["--dash-navy", "--dash-gold", "padding-left: 282px", ".workspace-menu-toggle", ".workspace-header.is-menu-open", ".account-section-nav", ":focus-visible", "@media (max-width: 1020px)"]) {
  if (!premiumCss.includes(requirement)) failures.push(`Premium dashboard design system is missing ${requirement}`);
}
const polishCss = read("apps/web/src/app/workspace-polish.css");
for (const requirement of [".account-section-nav-content", ".account-section-nav-more", ".account-section-nav-primary"]) {
  if (!polishCss.includes(requirement)) failures.push(`Workspace polish is missing comprehensive customer navigation style ${requirement}`);
}
const luxuryCss = read("apps/web/src/app/dashboard-luxury.css");
for (const requirement of [".workspace-nav-group > summary", ".workspace-link-icon", ".workspace-quick-section.is-compact", ".dashboard-kpis-refined", ".dashboard-insight-grid", ".account-live-card"]) {
  if (!luxuryCss.includes(requirement)) failures.push(`Premium low-density dashboard layer is missing ${requirement}`);
}
const layout = read("apps/web/src/app/layout.tsx");
if (!layout.includes('import "./workspace-polish.css"')) failures.push("Workspace polish stylesheet is not loaded after the shared dashboard styles");
if (!layout.includes('import "./dashboard-luxury.css"')) failures.push("Premium dashboard layer is not loaded last in the shared app layout");

if (failures.length) {
  console.error("Dashboard UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Dashboard UX checks passed: ${WORKSPACE_PAGE_ROUTES.length} canonical destinations, collapsible grouped navigation, compact actions, customer sections and secure workspace controls verified.`);

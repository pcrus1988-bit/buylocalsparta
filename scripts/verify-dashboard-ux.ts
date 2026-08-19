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
  const source = name === "Admin"
    ? `${read(path)}\n${read("apps/web/src/components/AdminWorkspaceHeaderClient.tsx")}\n${read("apps/web/src/lib/admin-navigation.ts")}`
    : read(path);
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

const primitives = "apps/web/src/components/WorkspacePagePrimitives.tsx";
if (!existsSync(`${root}/${primitives}`)) failures.push("Missing shared operational workspace page primitives");
else {
  const source = read(primitives);
  for (const requirement of ["WorkspaceMetricStrip", "WorkspaceSectionHeading", "WorkspaceEmptyState", "WorkspaceRecordDetails", "<details"]) {
    if (!source.includes(requirement)) failures.push(`Operational workspace primitives are missing ${requirement}`);
  }
}

const operationalPages = [
  "apps/web/src/app/admin/vendors/page.tsx",
  "apps/web/src/app/admin/research-vendors/page.tsx",
  "apps/web/src/app/admin/matching/page.tsx",
  "apps/web/src/app/admin/orders/page.tsx",
  "apps/web/src/app/admin/finance/page.tsx",
  "apps/web/src/app/admin/trust/page.tsx",
  "apps/web/src/app/admin/categories/page.tsx",
  "apps/web/src/app/admin/content/page.tsx",
  "apps/web/src/app/admin/reviews/page.tsx",
  "apps/web/src/app/admin/recalls/page.tsx",
  "apps/web/src/app/admin/privacy/page.tsx",
  "apps/web/src/app/admin/tax/page.tsx",
  "apps/web/src/app/admin/fairness/page.tsx",
  "apps/web/src/app/admin/analytics/page.tsx",
  "apps/web/src/app/admin/operations/page.tsx",
  "apps/web/src/app/admin/maintenance/page.tsx",
  "apps/web/src/app/admin/activation/page.tsx",
  "apps/web/src/app/vendor/catalog/page.tsx",
  "apps/web/src/app/vendor/shipping/page.tsx",
  "apps/web/src/app/vendor/returns/page.tsx",
  "apps/web/src/app/vendor/trust/page.tsx",
  "apps/web/src/app/vendor/advice/page.tsx",
  "apps/web/src/app/vendor/finance/page.tsx",
  "apps/web/src/app/vendor/analytics/page.tsx"
] as const;
for (const path of operationalPages) {
  const source = read(path);
  if (!source.includes("dashboard-hero-refined")) failures.push(`Operational workspace page is missing refined task hierarchy: ${path}`);
}

for (const path of [
  "apps/web/src/components/VendorCatalogClient.tsx",
  "apps/web/src/components/VendorShippingClient.tsx",
  "apps/web/src/components/VendorReturnsClient.tsx",
  "apps/web/src/components/VendorTrustClient.tsx",
  "apps/web/src/components/VendorAdviceClient.tsx",
  "apps/web/src/components/VendorFinanceClient.tsx",
  "apps/web/src/components/AdminShippingClient.tsx"
]) {
  const source = read(path);
  if (!source.includes("WorkspaceMetricStrip")) failures.push(`Operational client is missing a scannable metric strip: ${path}`);
  if (!source.includes("workspace-queue")) failures.push(`Operational client is missing shared queue hierarchy: ${path}`);
}

const catalogClient = read("apps/web/src/components/VendorCatalogClient.tsx");
if (catalogClient.includes("Demo product")) failures.push("Vendor CSV import must never prefill a demo product into a real import surface");
if (!catalogClient.includes("initial.csvTemplate")) failures.push("Vendor CSV import must start from the canonical safe template");
if (!catalogClient.includes("setPreview(null)")) failures.push("Editing vendor CSV must invalidate stale preview evidence");
if (!catalogClient.includes("preview.totalRows > 0 && preview.errors.length === 0")) failures.push("Vendor CSV confirm must require a clean non-empty dry run");

const vendorShippingPage = read("apps/web/src/app/vendor/shipping/page.tsx");
const adminShippingPage = read("apps/web/src/app/admin/shipping/page.tsx");
for (const [name, source] of [["Vendor", vendorShippingPage], ["Admin", adminShippingPage]] as const) {
  if (!source.includes("boxNowShippingEnabled()")) failures.push(`${name} shipping page must use the real provider capability gate`);
  if (!source.includes("WorkspaceEmptyState")) failures.push(`${name} shipping page must render a truthful disabled-provider state`);
}

const orderDetail = read("apps/web/src/components/OrderDetailClient.tsx");
if (!orderDetail.includes("order-cancel-disclosure")) failures.push("Customer cancellation must use progressive disclosure instead of a permanently prominent destructive card");
if (!orderDetail.includes('href="/delivery-pickup"') || !orderDetail.includes('href="/returns-refunds"')) failures.push("Customer order detail must expose delivery and returns help paths");
if (!orderDetail.includes('className="order-detail-id"') || orderDetail.includes("<strong>{item.id}</strong>")) failures.push("Customer order detail must keep fulfilment technical identifiers secondary");

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
const pageCss = read("apps/web/src/app/workspace-pages.css");
for (const requirement of [".workspace-page-metrics", ".workspace-tool-panel", ".workspace-queue-card", ".workspace-record-details", ".workspace-action-bar", ".order-cancel-disclosure", "@media (max-width: 560px)"]) {
  if (!pageCss.includes(requirement)) failures.push(`Operational workspace page layer is missing ${requirement}`);
}
const layout = read("apps/web/src/app/layout.tsx");
if (!layout.includes('import "./workspace-polish.css"')) failures.push("Workspace polish stylesheet is not loaded after the shared dashboard styles");
if (!layout.includes('import "./dashboard-luxury.css"')) failures.push("Premium dashboard layer is not loaded in the shared app layout");
if (!layout.includes('import "./workspace-pages.css"')) failures.push("Operational workspace page layer is not loaded in the shared app layout");
if (layout.indexOf('import "./workspace-pages.css"') < layout.indexOf('import "./dashboard-luxury.css"')) failures.push("Operational workspace page layer must load after the dashboard shell layer");

if (failures.length) {
  console.error("Dashboard UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Dashboard UX checks passed: ${WORKSPACE_PAGE_ROUTES.length} canonical destinations, collapsible navigation, progressive operational queues, safe bulk import, truthful provider gates and customer transaction controls verified.`);

import { existsSync, readFileSync } from "node:fs";
import { ADMIN_WORKSPACE_NAVIGATION, VENDOR_WORKSPACE_NAVIGATION, WORKSPACE_PAGE_ROUTES } from "../apps/web/src/lib/workspace-navigation.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];
const requireFile = (path: string, label = path) => { if (!existsSync(`${root}/${path}`)) failures.push(`Missing ${label}`); };
const requireText = (path: string, requirements: readonly string[]) => {
  requireFile(path);
  if (!existsSync(`${root}/${path}`)) return;
  const source = read(path);
  for (const requirement of requirements) if (!source.includes(requirement)) failures.push(`${path} is missing ${requirement}`);
};

for (const route of WORKSPACE_PAGE_ROUTES) {
  const page = route === "/vendor" ? "apps/web/src/app/vendor/page.tsx" : route === "/admin" ? "apps/web/src/app/admin/page.tsx" : `apps/web/src/app${route}/page.tsx`;
  if (!existsSync(`${root}/${page}`)) failures.push(`Workspace navigation points to missing page ${route}`);
}
if (new Set(WORKSPACE_PAGE_ROUTES).size !== WORKSPACE_PAGE_ROUTES.length) failures.push("Workspace navigation contains duplicate destinations");

requireText("apps/web/src/components/WorkspaceNavigation.tsx", ["usePathname", "<details", "<summary", "workspace-link-icon", 'from "next/link"']);
for (const group of VENDOR_WORKSPACE_NAVIGATION) {
  if (!group.links.length) failures.push(`Vendor group ${group.label} cannot be empty`);
  for (const link of group.links) if (!link.icon) failures.push(`Vendor link ${link.href} is missing an icon`);
}
const vendorHeader = read("apps/web/src/components/VendorWorkspaceHeader.tsx");
for (const requirement of ["VENDOR_WORKSPACE_NAVIGATION", "WorkspaceNavigation", "aria-expanded={menuOpen}", "workspace-menu-toggle", 'fetch("/api/vendor/session"', 'fetch("/api/vendor/logout"', "x-csrf-token"]) if (!vendorHeader.includes(requirement)) failures.push(`Vendor shell is missing ${requirement}`);

requireText("apps/web/src/components/AdminDomainNavigation.tsx", ["usePathname", "AdminDomainNavigation", "AdminContextNavigation", "AdminBreadcrumbs", 'from "next/link"', 'aria-current={active ? "page"', "admin-domain-badge", '"99+"']);
requireText("apps/web/src/components/AdminRecordStatus.tsx", ["AdminRecordState", "AdminAttentionFlag", "AdminStatusStack", "admin-record-state", "admin-attention-flag", "attentionSeverity"]);
requireText("apps/web/src/lib/admin-attention-projection.ts", ["PostgresUnitOfWork", "platformScope", "readOnly: true", "vendor_verification_queue", "catalog_review_queue", "pending_media", "pending_compliance", "payable_procurements", "fairness_appeals", "adminDomainAttentionBadges", 'assign("/admin/partners"', 'assign("/admin/matching"', 'assign("/admin/trust"', 'assign("/admin/finance"']);
for (const group of ADMIN_WORKSPACE_NAVIGATION) {
  if (!group.links.length) failures.push(`Admin domain ${group.label} cannot be empty`);
  if (!group.href || !group.icon) failures.push(`Admin domain ${group.label} needs a landing href and icon`);
  for (const link of group.links) if (!link.icon) failures.push(`Admin link ${link.href} is missing an icon`);
}
const adminHeader = `${read("apps/web/src/components/AdminWorkspaceHeader.tsx")}\n${read("apps/web/src/components/AdminWorkspaceHeaderClient.tsx")}\n${read("apps/web/src/lib/admin-navigation.ts")}`;
for (const requirement of ["ADMIN_WORKSPACE_NAVIGATION", "AdminDomainNavigation", "AdminContextNavigation", "AdminBreadcrumbs", "adminDomainAttentionBadges", ".catch(() => ({}))", "attentionBadges", "badge:", "admin-topbar", "admin-global-search", "/admin/search?q=", "aria-expanded={menuOpen}", "workspace-menu-toggle", "metaKey", "ctrlKey", "x-csrf-token"]) if (!adminHeader.includes(requirement)) failures.push(`Admin shell is missing ${requirement}`);

const account = read("apps/web/src/components/AccountDashboardClient.tsx");
for (const destination of ["/returns-refunds", "/delivery-pickup", "/privacy-controls", "/ask-local"]) if (!account.includes(`href: "${destination}"`) && !account.includes(`href="${destination}"`)) failures.push(`Account dashboard is missing task path ${destination}`);
for (const requirement of ["account-snapshot", "AccountSectionNavigation", 'density="compact"', 'role="alert"']) if (!account.includes(requirement)) failures.push(`Account dashboard is missing ${requirement}`);
const accountNav = read("apps/web/src/components/AccountSectionNavigation.tsx");
for (const sectionId of ["overview", "ask-local", "orders", "saved", "notifications", "searches", "recommendations", "privacy", "recent"]) if (!accountNav.includes(`href: "#${sectionId}"`)) failures.push(`Customer account navigation does not expose #${sectionId}`);

const vendorDashboard = read("apps/web/src/components/VendorDashboardClient.tsx");
for (const destination of ["/vendor/catalog", "/vendor/shipping", "/vendor/returns", "/vendor/trust", "/vendor/advice", "/vendor/finance"]) if (!vendorDashboard.includes(`href: "${destination}"`)) failures.push(`Vendor dashboard is missing task path ${destination}`);
if (!vendorDashboard.includes('density="compact"')) failures.push("Vendor dashboard quick actions must use compact density");
if (vendorDashboard.includes('fetch("/api/vendor/logout"')) failures.push("Vendor logout must stay in the shared header");

requireText("apps/web/src/app/admin/page.tsx", ["admin-attention-list", "dashboard-insight-grid", "WorkspaceMetricStrip", "/admin/partners/pipeline", "/admin/matching", "/admin/trust", "/admin/finance", "/admin/fairness"]);
if (read("apps/web/src/app/admin/page.tsx").includes("Admin directory")) failures.push("Admin Command Centre must not duplicate the sidebar directory");

for (const path of [
  "apps/web/src/app/admin/work/page.tsx",
  "apps/web/src/app/admin/partners/page.tsx",
  "apps/web/src/app/admin/partners/pipeline/page.tsx",
  "apps/web/src/app/admin/platform/page.tsx",
  "apps/web/src/app/admin/search/page.tsx",
  "apps/web/src/app/admin/customers/page.tsx",
  "apps/web/src/app/admin/vendors/page.tsx",
  "apps/web/src/app/admin/orders/page.tsx",
  "apps/web/src/app/admin/orders/[id]/page.tsx",
  "apps/web/src/app/admin/matching/page.tsx",
  "apps/web/src/app/admin/customers/support/page.tsx",
  "apps/web/src/app/admin/tax/page.tsx",
  "apps/web/src/app/admin/reports/page.tsx",
  "apps/web/src/app/admin/analytics/page.tsx",
  "apps/web/src/app/admin/content/page.tsx",
  "apps/web/src/app/admin/hero/page.tsx",
  "apps/web/src/app/admin/email-lab/page.tsx"
]) requireText(path, ["dashboard-hero-refined", "AdminWorkspaceHeader"]);

requireText("apps/web/src/app/admin/partners/page.tsx", ["Commercial readiness", "commercialAgreementWorkspace", "adminSlaPolicyWorkspace", "adminVendorBillingWorkspace", "admin-insight-table", "Agreement → SLA → billing", "/admin/finance/vendor-billing"]);
requireText("apps/web/src/app/admin/partners/[id]/page.tsx", ["admin-local-tabs", "VendorToggleControl", "VendorAgreementForm", "adminOrdersReturnsWorkspace", "adminVendorFiscalWorkspace", "marketplaceReferenceMap", "Agreement & SLA", "partner-documents"]);
requireText("apps/web/src/app/admin/vendors/page.tsx", ["admin-partner-directory", "/admin/partners/${encodeURIComponent(shop.id)}", "Partner saved views", "view=active", "view=attention", "view=public", "view=hidden", "AdminStatusStack", "partnerAttention", "Agreement gap", "State / attention"]);
requireText("apps/web/src/app/admin/customers/page.tsx", ["admin-directory-table", "Customer 360", "Customer saved views", "view=attention", "view=new", "view=orders", "view=unverified", "AdminStatusStack", "customerAttention", "Verification pending", "State / attention"]);
requireText("apps/web/src/app/admin/orders/page.tsx", ["admin-orders-directory", "marketplaceReferenceMap", "Returns & refunds", "Order saved views", "view=open", "view=returns", "view=completed", "/admin/orders/${encodeURIComponent(reference)}", "Open order", "AdminStatusStack", "orderAttention", "order.returns.length ?", "State / attention"]);
requireText("apps/web/src/app/admin/orders/[id]/page.tsx", ["adminOrdersReturnsWorkspace", "marketplaceReferenceMap", "admin-order-record-hero", "Technical ID", "Customer 360", "/admin/partners/${encodeURIComponent", "/api/admin/orders/action", "Open return workflow", "Internal metadata"]);
requireText("apps/web/src/app/admin/search/page.tsx", ["marketplaceReferenceMap", "/admin/partners/${encodeURIComponent(shop.id)}"]);
requireText("apps/web/src/app/admin/matching/page.tsx", ["admin-split-workspace", "admin-triage-list", "admin-decision-panel", "Approve match", "Create canonical"]);
requireText("apps/web/src/components/AskLocalWorkflowPanel.tsx", ["admin-work-queue-split", "admin-work-list", "admin-work-detail", "Assign vendor", "Return to Admin"]);
requireText("apps/web/src/app/admin/customers/support/page.tsx", ["admin-work-queue-split", "Assign to me", "Resolve", "Urgent"]);
requireText("apps/web/src/app/admin/tax/page.tsx", ["admin-local-tabs", "#tax-documents", "admin-tax-documents", "Automatic resend remains blocked", "/api/admin/tax/reconcile", "#tax-reconciliation", "#tax-configuration", "#tax-policy", "#tax-vat", "#tax-connection"]);
requireText("apps/web/src/app/admin/reports/page.tsx", ["admin-local-tabs", "#reports-saved", "#reports-history", "admin-report-history"]);
requireText("apps/web/src/app/admin/analytics/page.tsx", ["admin-insight-table", "progress", "/admin/reports"]);
requireText("apps/web/src/app/admin/content/page.tsx", ["Content operations", "admin-local-tabs", "#content-pages", "#content-stories", "Email templates & delivery", "/admin/hero", "/admin/email-lab"]);

for (const [path, title] of [
  ["apps/web/src/app/admin/notifications/page.tsx", "SLA & Escalations"],
  ["apps/web/src/app/admin/shipping/page.tsx", "BOX NOW Integration"],
  ["apps/web/src/app/admin/activation/page.tsx", "Launch Readiness"],
  ["apps/web/src/app/admin/operations/page.tsx", "System Health & Audit"],
  ["apps/web/src/app/admin/categories/page.tsx", "Categories & Policies"],
  ["apps/web/src/app/admin/recalls/page.tsx", "Product Safety"],
  ["apps/web/src/app/admin/hero/page.tsx", "Homepage merchandising"],
  ["apps/web/src/app/admin/email-lab/page.tsx", "Email Templates & Delivery"]
] as const) requireText(path, [title]);

const primitives = read("apps/web/src/components/WorkspacePagePrimitives.tsx");
for (const requirement of ["WorkspaceMetricStrip", "WorkspaceSectionHeading", "WorkspaceEmptyState", "WorkspaceRecordDetails", "<details"]) if (!primitives.includes(requirement)) failures.push(`Workspace primitives are missing ${requirement}`);

for (const path of [
  "apps/web/src/components/VendorCatalogClient.tsx", "apps/web/src/components/VendorShippingClient.tsx", "apps/web/src/components/VendorReturnsClient.tsx", "apps/web/src/components/VendorTrustClient.tsx", "apps/web/src/components/VendorAdviceClient.tsx", "apps/web/src/components/VendorFinanceClient.tsx", "apps/web/src/components/AdminShippingClient.tsx"
]) {
  const source = read(path);
  if (!source.includes("WorkspaceMetricStrip")) failures.push(`Operational client is missing metric strip: ${path}`);
  if (!source.includes("workspace-queue")) failures.push(`Operational client is missing queue hierarchy: ${path}`);
}
const catalogClient = read("apps/web/src/components/VendorCatalogClient.tsx");
if (catalogClient.includes("Demo product")) failures.push("Vendor CSV import must never prefill demo data");
for (const requirement of ["initial.csvTemplate", "setPreview(null)", "preview.totalRows > 0 && preview.errors.length === 0"]) if (!catalogClient.includes(requirement)) failures.push(`Vendor CSV safety is missing ${requirement}`);
for (const [name, path] of [["Vendor", "apps/web/src/app/vendor/shipping/page.tsx"], ["Admin", "apps/web/src/app/admin/shipping/page.tsx"]] as const) {
  const source = read(path);
  if (!source.includes("boxNowShippingEnabled()")) failures.push(`${name} shipping page must use the real BOX NOW capability gate`);
  if (!source.includes("WorkspaceEmptyState")) failures.push(`${name} shipping page must expose the disabled-provider state`);
}
const orderDetail = read("apps/web/src/components/OrderDetailClient.tsx");
if (!orderDetail.includes("order-cancel-disclosure")) failures.push("Customer cancellation must use progressive disclosure");
if (!orderDetail.includes('href="/delivery-pickup"') || !orderDetail.includes('href="/returns-refunds"')) failures.push("Order detail must expose delivery and returns help");
if (!orderDetail.includes('className="order-detail-id"') || orderDetail.includes("<strong>{item.id}</strong>")) failures.push("Technical fulfilment IDs must remain secondary");

const adminStyles = [
  "admin-information-architecture.css", "admin-domain-workspaces.css", "admin-directory-search.css", "admin-orders-directory.css", "admin-order-record.css", "admin-status-semantics.css", "admin-local-tabs.css", "admin-partner-record.css", "admin-matching-split.css", "admin-queue-split.css", "admin-insights.css", "admin-tax-documents.css"
] as const;
const adminCss = adminStyles.map((name) => read(`apps/web/src/app/${name}`)).join("\n");
for (const requirement of [".admin-domain-nav", ".admin-domain-badge", ".admin-topbar", ".admin-context-nav", ".admin-global-search", ".admin-attention-list", ".admin-domain-card-grid", ".admin-pipeline", ".admin-directory-table", ".admin-search-results", ".admin-local-tabs", ".admin-partner-directory", ".admin-order-record-hero", ".admin-order-line-table", ".admin-status-stack", ".admin-record-state", ".admin-attention-flag", ".admin-split-workspace", ".admin-work-queue-split", ".admin-insight-table", ".admin-tax-documents", "@media(max-width:1020px)"]) if (!adminCss.includes(requirement)) failures.push(`Admin IA styles are missing ${requirement}`);
const layout = read("apps/web/src/app/layout.tsx");
for (const stylesheet of ["workspace-polish.css", "dashboard-luxury.css", "workspace-pages.css", ...adminStyles]) if (!layout.includes(`import "./${stylesheet}"`)) failures.push(`Shared layout is missing ${stylesheet}`);
if (layout.indexOf('import "./admin-information-architecture.css"') < layout.indexOf('import "./typography-readability.css"')) failures.push("Admin IA overrides must load after shared readability styles");

if (failures.length) {
  console.error("Dashboard UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Dashboard UX checks passed: ${WORKSPACE_PAGE_ROUTES.length} canonical destinations, domain-based Admin IA, lightweight attention badges, semantic record-state versus attention indicators, Action Centre, commercial readiness, content operations, saved directory views, partner records, public-number order records, global search, dense directories, focused queues, fiscal document register, local tabs, insight tables and existing customer/vendor safety controls verified.`);

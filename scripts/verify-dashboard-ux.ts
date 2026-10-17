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
const primaryWorkspaceRoutes = [
  ...VENDOR_WORKSPACE_NAVIGATION.flatMap((group) => group.links.filter((link) => !link.contextHidden).map((link) => link.href)),
  ...ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links.filter((link) => !link.contextHidden).map((link) => link.href))
];
if (new Set(primaryWorkspaceRoutes).size !== primaryWorkspaceRoutes.length) failures.push("Workspace navigation contains duplicate primary destinations");

requireText("apps/web/src/components/WorkspaceNavigation.tsx", ["usePathname", "<details", "<summary", "workspace-link-icon", 'from "next/link"']);
for (const group of VENDOR_WORKSPACE_NAVIGATION) {
  if (!group.links.length) failures.push(`Vendor group ${group.label} cannot be empty`);
  for (const link of group.links) if (!link.icon) failures.push(`Vendor link ${link.href} is missing an icon`);
}
const vendorNavigation = read("apps/web/src/lib/workspace-navigation.ts");
for (const requirement of ["/vendor/preview", "/vendor/settings", "/vendor/settings/aade", "/vendor/settings/delivery", "/vendor/settings/promotions", "/vendor/settings/seo", "/vendor/settings/subscription"]) if (!vendorNavigation.includes(requirement)) failures.push(`Vendor navigation is missing ${requirement}`);
if (vendorNavigation.includes('label: "Εργαλεία HUB"')) failures.push("Vendor navigation must not expose the legacy technical HUB bucket");
requireText("apps/web/src/app/vendor/settings/page.tsx", ["Όλα τα βασικά του καταστήματός σου σε ένα σημείο", "/vendor/storefront", "/vendor/preview", "/vendor/finance"]);
requireText("apps/web/src/app/vendor/preview/page.tsx", ["VendorWorkspaceHeader", "ΙΔΙΩΤΙΚΗ ΠΡΟΕΠΙΣΚΟΠΗΣΗ"]);
const vendorHeader = read("apps/web/src/components/VendorWorkspaceHeader.tsx");
for (const requirement of ["VENDOR_WORKSPACE_NAVIGATION", "WorkspaceNavigation", "aria-expanded={menuOpen}", "workspace-menu-toggle", 'fetch("/api/vendor/auth-context"', 'fetch("/api/vendor/logout"', "x-csrf-token", "usePathname", 'body.style.overflow = "hidden"', 'event.key !== "Escape"', "setMenuOpen(false)", "setTrialGuideOpen(false)"]) if (!vendorHeader.includes(requirement)) failures.push(`Vendor shell is missing ${requirement}`);
if (vendorHeader.includes('fetch("/api/vendor/session"')) failures.push("Vendor shell must not load the full vendor dashboard just to resolve navigation auth context");

requireText("apps/web/src/components/AdminDomainNavigation.tsx", ["usePathname", "AdminDomainNavigation", "AdminContextNavigation", "AdminBreadcrumbs", "entityLabel", 'from "next/link"', 'aria-current={active ? "page"', "admin-domain-badge", '"99+"']);
requireText("apps/web/src/components/AdminRecordStatus.tsx", ["AdminRecordState", "AdminAttentionFlag", "AdminStatusStack", "admin-record-state", "admin-attention-flag", "attentionSeverity"]);
requireText("apps/web/src/lib/admin-attention-projection.ts", ["PostgresUnitOfWork", "platformScope", "readOnly: true", "vendor_verification_queue", "catalog_review_queue", "pending_media", "pending_compliance", "payable_procurements", "fairness_appeals", "adminDomainAttentionBadges", 'assign("/admin/partners"', 'assign("/admin/matching"', 'assign("/admin/trust"', 'assign("/admin/finance"']);
for (const group of ADMIN_WORKSPACE_NAVIGATION) {
  if (!group.links.length) failures.push(`Admin domain ${group.label} cannot be empty`);
  if (!group.href || !group.icon) failures.push(`Admin domain ${group.label} needs a landing href and icon`);
  for (const link of group.links) if (!link.icon) failures.push(`Admin link ${link.href} is missing an icon`);
}
const adminHeader = `${read("apps/web/src/components/AdminWorkspaceHeader.tsx")}\n${read("apps/web/src/components/AdminWorkspaceHeaderClient.tsx")}\n${read("apps/web/src/lib/admin-navigation.ts")}`;
for (const requirement of ["ADMIN_WORKSPACE_NAVIGATION", "AdminDomainNavigation", "AdminContextNavigation", "AdminBreadcrumbs", "entityLabel={entityLabel}", "adminDomainAttentionBadges", ".catch(() => ({}))", "attentionBadges", "badge:", "admin-topbar", "admin-global-search", "/admin/search?q=", "aria-expanded={menuOpen}", "workspace-menu-toggle", "metaKey", "ctrlKey", "x-csrf-token"]) if (!adminHeader.includes(requirement)) failures.push(`Admin shell is missing ${requirement}`);

const account = read("apps/web/src/components/AccountDashboardClient.tsx");
for (const destination of ["/returns-refunds", "/delivery-pickup", "/privacy-controls", "/ask-local"]) if (!account.includes(`href: "${destination}"`) && !account.includes(`href="${destination}"`)) failures.push(`Account dashboard is missing task path ${destination}`);
for (const requirement of ["AccountHomeHub", "priorityGrid", "order-tracking", "activityDisclosure", "secondaryDetails", 'role="alert"', 'x-csrf-token']) if (!account.includes(requirement)) failures.push(`Account dashboard is missing ${requirement}`);
const accountPage = read("apps/web/src/app/account/page.tsx");
for (const requirement of ["AccountSectionNavigation", "AccountDashboardClient", "CustomerAccountSetupChecklist", "compactDashboardIntro"]) if (!accountPage.includes(requirement)) failures.push(`Account dashboard page is missing ${requirement}`);
const accountHub = read("apps/web/src/components/AccountHomeHub.tsx");
for (const route of [
  "/account/orders", "/account/wishlist", "/account/delivery", "/posokanei", "/account/ask-local",
  "/account/try-on", "/account/appointments", "/account/documents", "/account/gift-cards",
  "/account/saved", "/account/profile", "/account/notifications", "/account/security",
  "/account/privacy", "/account/support"
]) if (!accountHub.includes(`href: "${route}"`)) failures.push(`Account card navigation is missing ${route}`);
for (const requirement of ["TileIcon", "aria-label", "activeOrders", "unreadNotifications", "savedProducts", "savedSearches", "Αγορές", "Υπηρεσίες", "Προσωπικά & ρυθμίσεις"]) if (!accountHub.includes(requirement)) failures.push(`Account hub is missing ${requirement}`);
const accountNav = read("apps/web/src/components/AccountSectionNavigation.tsx");
for (const requirement of ["Αγορές & παρακολούθηση", "Τοπική βοήθεια", "Προφίλ & ασφάλεια", "/account/ask-local", "/account/orders", "/account/privacy", "navDisclosure", 'pathname === "/account"']) if (!accountNav.includes(requirement)) failures.push(`Customer account navigation is missing ${requirement}`);
const accountStyles = read("apps/web/src/components/CustomerAccountExperience.module.css");
for (const requirement of [".compactDashboardIntro", ".priorityGrid", ".trackerCard", ".secondaryDetails", ".activityDisclosure", ".navDisclosure", "@media (max-width: 620px)"]) if (!accountStyles.includes(requirement)) failures.push(`Customer account experience styles are missing ${requirement}`);
const accountHubStyles = read("apps/web/src/components/AccountHomeHub.module.css");
for (const requirement of [".tileGrid", ".tileIcon", ".stats", ".section", "focus-visible", "@media (max-width:740px)", "prefers-reduced-motion"]) if (!accountHubStyles.includes(requirement)) failures.push(`Responsive account hub styles are missing ${requirement}`);

// Customer subpages share one visual system without changing account data/actions.
for (const requirement of ["navLocation", "navCurrent", "navNearby", "aria-current", "navDisclosure"]) if (!accountNav.includes(requirement)) failures.push(`Customer subpage navigation is missing ${requirement}`);
const customerPolish = read("apps/web/src/app/customer-subpages-polish.css");
for (const requirement of [".customer-page-heading", ".customer-account-panel", ".customer-order-card", ".customer-notification-item", ".customer-address-card", ".account-gift-card", ".account-saved-page", "@media(max-width:640px)", "prefers-reduced-motion"]) if (!customerPolish.includes(requirement)) failures.push(`Customer subpage polish is missing ${requirement}`);
if (!read("apps/web/src/app/layout.tsx").includes('import "./customer-subpages-polish.css"')) failures.push("Customer subpage CSS not loaded in root layout");
const giftCardPage = read("apps/web/src/app/account/gift-cards/page.tsx");
for (const requirement of ["account-app", "AccountSectionNavigation", "SiteHeader", "/login?next=/account/gift-cards", "GiftCardWalletClient"]) if (!giftCardPage.includes(requirement)) failures.push(`Gift card customer shell is missing ${requirement}`);
if (giftCardPage.includes('className="vendor-app"')) failures.push("Gift cards must not render inside the vendor workspace shell");
const giftCardWallet = read("apps/web/src/components/GiftCardWalletClient.tsx");
for (const requirement of ["account-gift-wallet", "account-gift-list", "account-gift-card", "account-empty", 'type="submit"', "x-csrf-token"]) if (!giftCardWallet.includes(requirement)) failures.push(`Customer gift card wallet is missing ${requirement}`);
const deliveryPage = read("apps/web/src/app/account/delivery/page.tsx");
for (const requirement of ["account-app", "AccountSectionNavigation", "CustomerDeliveryWorkspaceClient", "/account/orders"]) if (!deliveryPage.includes(requirement)) failures.push(`Delivery account page is missing ${requirement}`);
const notificationPage = read("apps/web/src/app/account/notifications/page.tsx");
for (const requirement of ["AccountNotificationsClient", "account-subpage-settings", "CartRecoveryPreferenceToggle"]) if (!notificationPage.includes(requirement)) failures.push(`Notification inbox preferences are missing ${requirement}`);
const ordersPage = read("apps/web/src/app/account/orders/page.tsx");
if (!ordersPage.includes('className="filter-count"')) failures.push("Customer order filters are missing result counts");
if (!read("apps/web/src/app/account/orders/[id]/page.tsx").includes("account-app account-order-page")) failures.push("Customer order detail is not in shared account shell");

// Final account subpages: preserve real workflows while improving discoverability.
const accountRemainingCss = read("apps/web/src/app/customer-account-remaining.css");
for (const selector of [".account-subpage-jumps", ".account-ask-local-workspace", ".account-appointment-booking", ".account-documents-grid", ".account-privacy-card", ".account-support-conversation", "@media(max-width:640px)"]) if (!accountRemainingCss.includes(selector)) failures.push(`Final account subpage styles are missing ${selector}`);
if (!read("apps/web/src/app/layout.tsx").includes('import "./customer-account-remaining.css"')) failures.push("Final customer account CSS must be loaded");
const askLocalPage = read("apps/web/src/app/account/ask-local/page.tsx");
const askLocalClient = read("apps/web/src/components/AskLocalClient.tsx");
for (const id of ["#new-ask-local", "#my-ask-local"]) if (!askLocalPage.includes(id)) failures.push(`Ask Local page missing jump ${id}`);
for (const id of ['id="new-ask-local"', 'id="my-ask-local"']) if (!askLocalClient.includes(id)) failures.push(`Ask Local section missing anchor ${id}`);
if (askLocalClient.includes('defaultValue="23100"')) failures.push("Ask Local postcode must not default to Sparta for all customers");
for (const phrase of ['name="postcode"', 'name="quantity"', 'name="need"', 'onSubmit={submit}', 'AskLocalRichCapture']) if (!askLocalClient.includes(phrase)) failures.push(`Ask Local client lost core field ${phrase}`);
const appointmentsPage = read("apps/web/src/app/account/appointments/page.tsx");
const appointmentClient = read("apps/web/src/components/CustomerAppointmentsClient.tsx");
for (const id of ["#book-account-appointment", "#my-account-appointments"]) if (!appointmentsPage.includes(id)) failures.push(`Appointments page missing jump ${id}`);
for (const id of ['id="book-account-appointment"', 'id="my-account-appointments"']) if (!appointmentClient.includes(id)) failures.push(`Appointments section missing anchor ${id}`);
for (const phrase of ['onSubmit={submitBooking}', 'submitBooking', 'reschedule', 'cancel']) if (!appointmentClient.includes(phrase)) failures.push(`Appointments workflow lost ${phrase}`);
const documentsPage = read("apps/web/src/app/account/documents/page.tsx");
for (const phrase of ["account-documents-grid", "account-document-download", "documents.length", "/api/account/documents/", "paint-and-build-studio", "AccountSectionNavigation"]) if (!documentsPage.includes(phrase)) failures.push(`Documents page missing ${phrase}`);
const privacyPage = read("apps/web/src/app/account/privacy/page.tsx");
const privacyClient = read("apps/web/src/components/AccountPrivacyRightsClient.tsx");
for (const id of ["account-privacy-preferences", "account-privacy-cookies", "account-privacy-request", "account-privacy-history"]) {
  if (!privacyPage.includes(`#${id}`) || !privacyClient.includes(`id="${id}"`)) failures.push(`Privacy link target mismatch ${id}`);
}
for (const phrase of ["CookieSettingsButton", 'onClick={() => void submit()}', "/api/account/privacy/report/"]) if (!privacyClient.includes(phrase)) failures.push(`Privacy controls lost ${phrase}`);
const supportClient = read("apps/web/src/components/CustomerSupportClient.tsx");
for (const phrase of ["account-support-conversation", "open={item.status", "customer-support-thread", "customer-support-reply", "customer-support-new-case", "account-support-my-cases", "onSubmit={createCase}", "sendReply(item.id)"]) if (!supportClient.includes(phrase)) failures.push(`Support center missing ${phrase}`);
const tryOnStyles = read("apps/web/src/components/AccountTryOnSetupClient.module.css");
for (const phrase of [".pageRoot", ".quotaBlock", ".setupGrid", ".savedGrid", "@media(max-width:520px)"]) if (!tryOnStyles.includes(phrase)) failures.push(`Try On responsive styles missing ${phrase}`);

const vendorIaCss = read("apps/web/src/app/vendor-information-architecture.css");
for (const requirement of [".vendor-settings-grid", ".vendor-subpage-back", ".vendor-app .workspace-page-metrics", ".vendor-app .workspace-form-actions", "@media(max-width:620px)", "Complete vendor mobile workspace pass", "height: 100dvh", "min-height: 52px", "overflow-x: clip", "grid-template-columns: 1fr"]) if (!vendorIaCss.includes(requirement)) failures.push(`Vendor subpage polish is missing ${requirement}`);

const vendorDomainNav = read("apps/web/src/components/VendorDomainNavigation.tsx");
for (const requirement of ["useRef", "scrollIntoView", '[aria-current="page"]', 'inline: "center"']) if (!vendorDomainNav.includes(requirement)) failures.push(`Vendor mobile context navigation is missing ${requirement}`);

const vendorLifecycleCss = read("apps/web/src/app/vendor-lifecycle.css");
for (const requirement of ["Phone ergonomics for vendor operational lifecycles", "@media(max-width:620px)", "width:32px", "font-size:13px"]) if (!vendorLifecycleCss.includes(requirement)) failures.push(`Vendor mobile lifecycle polish is missing ${requirement}`);

const vendorCatalogMobileCss = read("apps/web/src/components/VendorCatalogClient.module.css");
for (const requirement of ["Narrow-phone catalogue controls", "@media(max-width:420px)", ".stockEditor{grid-template-columns:1fr}", ".productHead{grid-template-columns:1fr}"]) if (!vendorCatalogMobileCss.includes(requirement)) failures.push(`Vendor mobile catalogue polish is missing ${requirement}`);

for (const requirement of ["description: \"Σήμερα, εκκρεμότητες και γρήγορες ενέργειες\"", 'label: "Όλες"', 'label: "Εμφάνιση στη Google"']) if (!vendorNavigation.includes(requirement)) failures.push(`Vendor navigation clarity is missing ${requirement}`);
for (const requirement of ["vendor-domain-copy", "group.description"]) if (!vendorDomainNav.includes(requirement)) failures.push(`Vendor guided navigation is missing ${requirement}`);
for (const requirement of ["Vendor UX consolidation — one visual language", ".vendor-settings-card", ".vendor-page-action-row", ".vendor-card-grid"]) if (!vendorIaCss.includes(requirement)) failures.push(`Vendor UX consolidation is missing ${requirement}`);

const vendorSettingsPage = read("apps/web/src/app/vendor/settings/page.tsx");
for (const requirement of ["vendor-settings-card", "Εμφάνιση στη Google", "Ρύθμιση εμφάνισης"]) if (!vendorSettingsPage.includes(requirement)) failures.push(`Vendor settings clarity is missing ${requirement}`);

const vendorTrialPage = read("apps/web/src/app/vendor/trial/page.tsx");
for (const requirement of ["Συνέχισε το βήμα", "tourDisclosureSummary", "<details className={styles.guideTour}"]) if (!vendorTrialPage.includes(requirement)) failures.push(`Vendor trial simplification is missing ${requirement}`);

const vendorPlainLanguageFiles = [
  "apps/web/src/app/vendor/orders/page.tsx",
  "apps/web/src/app/vendor/dropshipping/attention/page.tsx",
  "apps/web/src/components/VendorProductFeedClient.tsx",
  "apps/web/src/components/VendorCatalogClient.tsx"
] as const;
for (const vendorPath of vendorPlainLanguageFiles) {
  const source = read(vendorPath);
  for (const forbidden of ["Review queue", "Published · unavailable", "Field mapping", ">Upload XML</button>", "status σε ένα σημείο", "Χρησιμοποίησε τα tabs", "XML Feed / Product Import", "live canonical matching", "canonical προϊόν", "Φυσικό stock", "<strong>Offer</strong>", "<strong>Product reference</strong>"]) {
    if (source.includes(forbidden)) failures.push(`Vendor UI still exposes technical wording ${forbidden} in ${vendorPath}`);
  }
}

for (const path of [
  "apps/web/src/app/vendor/orders/page.tsx",
  "apps/web/src/app/vendor/notifications/page.tsx",
  "apps/web/src/app/vendor/shipping/page.tsx",
  "apps/web/src/app/vendor/pickup/scan/page.tsx",
  "apps/web/src/app/vendor/returns/page.tsx",
  "apps/web/src/app/vendor/catalog/page.tsx",
  "apps/web/src/app/vendor/catalog/feed/page.tsx",
  "apps/web/src/app/vendor/trust/page.tsx",
  "apps/web/src/app/vendor/advice/page.tsx",
  "apps/web/src/app/vendor/storefront/page.tsx",
  "apps/web/src/app/vendor/preview/page.tsx",
  "apps/web/src/app/vendor/finance/page.tsx",
  "apps/web/src/app/vendor/analytics/page.tsx",
  "apps/web/src/app/vendor/reports/page.tsx",
  "apps/web/src/app/vendor/daily-access/page.tsx",
  "apps/web/src/app/vendor/trial/page.tsx",
  "apps/web/src/app/vendor/trial-expired/page.tsx",
  "apps/web/src/app/vendor/settings/page.tsx",
  "apps/web/src/app/vendor/dropshipping/page.tsx",
  "apps/web/src/app/vendor/dropshipping/analytics/page.tsx",
  "apps/web/src/app/vendor/dropshipping/attention/page.tsx",
  "apps/web/src/app/vendor/dropshipping/health/page.tsx",
  "apps/web/src/app/vendor/dropshipping/activity/page.tsx"
] as const) {
  const source = read(path);
  if (!source.includes("vendor-app")) failures.push(`Vendor subpage is outside the shared layout shell: ${path}`);
  if (!source.includes("VendorWorkspaceHeader")) failures.push(`Vendor subpage is missing shared navigation: ${path}`);
}
requireText("apps/web/src/app/vendor/pickup/scan/page.tsx", ["vendor-hero vendor-hero-compact", "Παράδοση παραγγελίας με QR"]);
requireText("apps/web/src/app/vendor/settings/page.tsx", ["vendor-settings-grid"]);
for (const path of [
  "apps/web/src/app/vendor/dropshipping/page.tsx",
  "apps/web/src/app/vendor/dropshipping/analytics/page.tsx",
  "apps/web/src/app/vendor/dropshipping/attention/page.tsx",
  "apps/web/src/app/vendor/dropshipping/health/page.tsx",
  "apps/web/src/app/vendor/dropshipping/activity/page.tsx"
] as const) {
  const source = read(path);
  if (source.includes("Dropshipping Control Centre")) failures.push(`Dropshipping page regressed to English control-centre heading: ${path}`);
}
const vendorDashboard = read("apps/web/src/components/VendorDashboardClient.tsx");
for (const destination of ["/vendor/catalog", "/vendor/shipping", "/vendor/returns", "/vendor/trust", "/vendor/advice", "/vendor/finance"]) if (!vendorDashboard.includes(`href: "${destination}"`)) failures.push(`Vendor dashboard is missing task path ${destination}`);
if (!vendorDashboard.includes('density="compact"')) failures.push("Vendor dashboard quick actions must use compact density");
if (vendorDashboard.includes('fetch("/api/vendor/logout"')) failures.push("Vendor logout must stay in the shared header");


for (const forbidden of ['kicker: "Catalog"', 'kicker: "Fulfilment"', '<div className="eyebrow">Fulfilment</div>', '<div className="eyebrow">Inventory</div>', "<dt>Safety stock</dt>", ">On hand</label>", "invoice matching", "settlement controls"]) {
  if (vendorDashboard.includes(forbidden)) failures.push(`Vendor home still exposes system wording ${forbidden}`);
}

const vendorDailyAccess = read("apps/web/src/components/VendorDailyAccessClient.tsx");
if (vendorDailyAccess.includes("<VendorLifecycle")) failures.push("Vendor Daily access must not show redundant lifecycle strips");
for (const requirement of ["Τι μπορεί να κάνει;", "Ποιος έχει πρόσβαση", "Συνδεδεμένες συσκευές / συνεδρίες"]) if (!vendorDailyAccess.includes(requirement)) failures.push(`Vendor Daily access simplification is missing ${requirement}`);

const vendorStorefrontBuilder = read("apps/web/src/components/VendorStorefrontBuilder.tsx");
for (const requirement of ["styles.editorGroup", "Ενότητες προφίλ", "Προαιρετική σύνδεση αναρτήσεων και Reels", "Ιδιωτική προεπισκόπηση"]) if (!vendorStorefrontBuilder.includes(requirement)) failures.push(`Vendor storefront progressive disclosure is missing ${requirement}`);

const vendorDeliveryEligibility = read("apps/web/src/components/VendorDeliveryEligibilityPanel.tsx");
for (const forbidden of ["Φορτώνονται μόνο <strong>{PAGE_SIZE}</strong>", "Αναζήτηση και φίλτρα εκτελούνται στη βάση", "δεν κατεβάζει πλέον όλο τον κατάλογο"]) if (vendorDeliveryEligibility.includes(forbidden)) failures.push(`Vendor delivery modes still expose implementation detail ${forbidden}`);
for (const requirement of ["Εφαρμογή σε πολλά προϊόντα", "Δικές σου ρυθμίσεις", "Επίλεξε τα εμφανιζόμενα"]) if (!vendorDeliveryEligibility.includes(requirement)) failures.push(`Vendor delivery modes clarity is missing ${requirement}`);

const vendorSmartProductForm = read("apps/web/src/components/VendorSmartProductForm.tsx");
for (const forbidden of ["canonical προϊόν", "canonical παραλλαγής", "canonical matching"]) if (vendorSmartProductForm.includes(forbidden)) failures.push(`Vendor product form still exposes catalogue internals ${forbidden}`);

const dropshippingFields = read("apps/web/src/components/DropshippingProductFieldControls.tsx");
for (const forbidden of ["Public fields", "Save override", "Use supplier defaults", "product override", "supplier defaults"]) if (dropshippingFields.includes(forbidden)) failures.push(`Dropshipping product fields still expose internal wording ${forbidden}`);
for (const requirement of ["Στοιχεία που εμφανίζονται στον πελάτη", "Αποθήκευση ειδικών ρυθμίσεων", "Χρήση γενικών ρυθμίσεων"]) if (!dropshippingFields.includes(requirement)) failures.push(`Dropshipping product field UX is missing ${requirement}`);

const vendorArchivedProducts = read("apps/web/src/components/VendorArchivedProductsPanel.tsx");
for (const forbidden of ["Αρχείο Admin", "στον Admin"]) if (vendorArchivedProducts.includes(forbidden)) failures.push(`Archived product recovery still exposes admin wording ${forbidden}`);

const vendorPriceManager = read("apps/web/src/components/VendorPriceManager.tsx");
for (const forbidden of [">Markup</label>", "backoffice", "στο checkout", "στον server"]) if (vendorPriceManager.includes(forbidden)) failures.push(`Vendor price manager still exposes technical wording ${forbidden}`);
for (const requirement of ["αγορά → περιθώριο → έκπτωση", "Τι θα βλέπει ο πελάτης:", "Εμφάνιση προτεινόμενης λιανικής στο κατάστημα"]) if (!vendorPriceManager.includes(requirement)) failures.push(`Vendor pricing UX is missing ${requirement}`);

const vendorConfirmation = read("apps/web/src/components/VendorConfirmation.tsx");
for (const requirement of ["useVendorConfirmation", 'role="dialog"', 'aria-modal="true"', 'event.key === "Escape"', 'event.key !== "Tab"', "dialogRef", "returnFocusRef", "vendor-confirmation-actions"]) if (!vendorConfirmation.includes(requirement)) failures.push(`Vendor confirmation UX is missing ${requirement}`);
for (const vendorPath of [
  "apps/web/src/components/VendorOrdersClient.tsx",
  "apps/web/src/components/VendorReturnsClient.tsx",
  "apps/web/src/components/VendorCatalogClient.tsx",
  "apps/web/src/components/VendorDailyAccessClient.tsx",
  "apps/web/src/components/VendorPickupCollectClient.tsx"
] as const) {
  const source = read(vendorPath);
  if (source.includes("window.confirm")) failures.push(`Vendor workflow still uses a browser-native confirm dialog: ${vendorPath}`);
  if (!source.includes("useVendorConfirmation")) failures.push(`Vendor workflow is missing contextual confirmation UX: ${vendorPath}`);
}
for (const requirement of [".vendor-confirmation-backdrop", ".vendor-confirmation-dialog", ".vendor-confirmation-actions"]) if (!vendorIaCss.includes(requirement)) failures.push(`Vendor confirmation styles are missing ${requirement}`);


for (const requirement of ['eyebrow="Συνεργασία"', "Εμφάνιση στη Google", "Ρύθμιση εμφάνισης"]) if (!vendorSettingsPage.includes(requirement)) failures.push(`Vendor settings index second-pass polish is missing ${requirement}`);

requireText("apps/web/src/app/admin/page.tsx", ["AdminDashboardCanvas", 'id: "attention"', "totalAttention", 'kind: "metric"', "/admin/partners/pipeline", "/admin/matching", "/admin/trust", "/admin/finance", "/admin/fairness"]);
requireText("apps/web/src/components/AdminDashboardCanvas.tsx", ["STORAGE_KEY", "defaultLayout", "mergeLayout", "saveCurrentView", "resetLayout", "widgetQuery", "admin-dashboard-canvas", "admin-dashboard-widget-stats", "admin-dashboard-widget-list", "admin-dashboard-widget-controls"]);
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

// Partner lifecycle stays in Partners; billing and fiscal execution stay in their source workspaces.
requireText("apps/web/src/app/admin/partners/page.tsx", ["Partner operations", "commercialAgreementWorkspace", "adminSlaPolicyWorkspace", "partner-workflow-grid", "Agreement & SLA blockers", "/admin/finance/vendor-billing", "/admin/tax"]);
requireText("apps/web/src/app/admin/partners/[id]/page.tsx", ["admin-local-tabs", "VendorToggleControl", "VendorAgreementForm", "adminOrdersReturnsWorkspace", "marketplaceReferenceMap", "Agreement & SLA", "Catalogue / DEMO", "/admin/finance/vendor-billing", "/admin/tax", "entityLabel={shop.tradingName}"]);
requireText("apps/web/src/app/admin/applications/page.tsx", ["Applications", "governed intake", "/admin/partners/pipeline", "/admin/research-vendors", "/admin/vendors"]);
requireText("apps/web/src/app/admin/prospects/page.tsx", ["Verified prospects & onboarding", "/admin/applications", "/admin/research-vendors", "/admin/finance/agreements"]);
requireText("apps/web/src/app/admin/finance/vendor-billing/page.tsx", ["adminVendorBillingWorkspace", "Vendor invoicing", "Prepared for AADE", "VendorBillingClient"]);
requireText("apps/web/src/app/admin/vendors/page.tsx", ["admin-partner-directory", "/admin/partners/${encodeURIComponent(shop.id)}", "Partner saved views", "view=active", "view=attention", "view=public", "view=hidden", "AdminStatusStack", "partnerAttention", "Agreement gap", "State / attention"]);
requireText("apps/web/src/app/admin/customers/page.tsx", ["admin-directory-table", "Customer 360", "Customer saved views", "view=attention", "view=new", "view=orders", "view=unverified", "AdminStatusStack", "customerAttention", "Verification pending", "State / attention"]);
requireText("apps/web/src/app/admin/orders/page.tsx", ["admin-orders-directory", "marketplaceReferenceMap", "Returns & refunds", "Order saved views", "view=open", "view=returns", "view=completed", "/admin/orders/${encodeURIComponent(reference)}", "Open order", "AdminStatusStack", "orderAttention", "order.returns.length ?", "State / attention"]);
requireText("apps/web/src/app/admin/orders/[id]/page.tsx", ["adminOrdersReturnsWorkspace", "marketplaceReferenceMap", "admin-order-record-hero", "Technical ID", "Customer 360", "/admin/partners/${encodeURIComponent", "/api/admin/orders/action", "Open return workflow", "Internal metadata", "entityLabel={reference}"]);
requireText("apps/web/src/app/admin/search/page.tsx", ["marketplaceReferenceMap", "/admin/partners/${encodeURIComponent(shop.id)}"]);
requireText("apps/web/src/app/admin/matching/page.tsx", ["admin-split-workspace", "admin-triage-list", "admin-decision-panel", "Approve match", "Create canonical"]);
requireText("apps/web/src/components/AskLocalWorkflowPanel.tsx", ["admin-work-queue-split", "admin-work-list", "admin-work-detail", "Assign vendor", "Return to Admin"]);
requireText("apps/web/src/app/admin/customers/support/page.tsx", ["admin-work-queue-split", "Assign to me", "Resolve", "Urgent"]);
requireText("apps/web/src/app/admin/tax/page.tsx", ["admin-local-tabs", "#tax-documents", "admin-tax-documents", "Automatic resend remains blocked", "/api/admin/tax/reconcile", "#tax-reconciliation", "#tax-configuration", "#tax-policy", "#tax-vat", "#tax-connection"]);
requireText("apps/web/src/app/admin/reports/page.tsx", ["admin-local-tabs", "#reports-saved", "#reports-history", "admin-report-history"]);
requireText("apps/web/src/app/admin/analytics/page.tsx", ["admin-insight-table", "progress", "/admin/reports"]);
requireText("apps/web/src/app/admin/content/page.tsx", ["Editorial operations", "admin-local-tabs", "#content-pages", "#content-redirects", "#content-stories", "content-workflow-grid", "/admin/hero", "/admin/email-lab", "/admin/seo"]);
requireText("apps/web/src/lib/admin-navigation.ts", ["CONTENT_OPERATOR_LINKS", "CMS & Routing", '"/admin/hero"', "Homepage", '"/admin/email-lab"', "Email"]);

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
const rootLayout = read("apps/web/src/app/layout.tsx");
for (const stylesheet of ["workspace-polish.css", "dashboard-luxury.css", "workspace-pages.css"]) if (!rootLayout.includes(`import "./${stylesheet}"`)) failures.push(`Shared layout is missing ${stylesheet}`);
const adminLayout = read("apps/web/src/app/admin/layout.tsx");
for (const stylesheet of adminStyles) if (!adminLayout.includes(`import "../${stylesheet}"`)) failures.push(`Admin layout is missing ${stylesheet}`);
if (!rootLayout.includes('import "./typography-readability.css"')) failures.push("Shared layout must retain typography-readability.css before nested Admin styles are applied");

if (failures.length) {
  console.error("Dashboard UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Dashboard UX checks passed: ${WORKSPACE_PAGE_ROUTES.length} canonical destinations, domain-based Admin IA, permission-aware customizable Admin Command Centre, lightweight attention badges, semantic record-state versus attention indicators, entity-aware Admin detail breadcrumbs, Action Centre, partner lifecycle readiness, content operations, saved directory views, partner records, public-number order records, global search, dense directories, focused queues, fiscal document register, local tabs, insight tables and existing customer/vendor safety controls verified.`);

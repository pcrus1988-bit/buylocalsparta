import type { Permission, VendorCapability } from "@buy-local-sparta/core";

export type WorkspaceNavLink = Readonly<{
  label: string;
  href: string;
  icon: string;
  permission?: Permission;
  roles?: ReadonlyArray<string>;
  vendorCapability?: VendorCapability;
  contextHidden?: boolean;
}>;

export type WorkspaceNavGroup = Readonly<{
  label: string;
  links: ReadonlyArray<WorkspaceNavLink>;
  href?: string;
  icon?: string;
  badge?: number;
  section?: string;
  description?: string;
}>;

export const VENDOR_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  { label: "Αρχική", href: "/vendor", icon: "⌂", links: [{ label: "Αρχική", href: "/vendor", icon: "⌂" }] },
  {
    label: "Παραγγελίες", href: "/vendor/orders", icon: "□",
    links: [
      { label: "Παραγγελίες", href: "/vendor/orders", icon: "□" },
      { label: "Προθεσμίες", href: "/vendor/notifications", icon: "!" },
      { label: "Αποστολές", href: "/vendor/shipping", icon: "↗", vendorCapability: "shipping.manage" },
      { label: "Παραλαβές", href: "/vendor/pickup/scan", icon: "⌁" },
      { label: "Επιστροφές", href: "/vendor/returns", icon: "↩" }
    ]
  },
  {
    label: "Προϊόντα", href: "/vendor/catalog", icon: "▦",
    links: [
      { label: "Κατάλογος & απόθεμα", href: "/vendor/catalog", icon: "▦", vendorCapability: "catalogue.read" },
      { label: "XML Product Feed", href: "/vendor/catalog/feed", icon: "⇩", vendorCapability: "catalogue.import" },
      { label: "Media & έγγραφα", href: "/vendor/trust", icon: "✓" }
    ]
  },
  { label: "Πελάτες", href: "/vendor/advice", icon: "◌", links: [{ label: "Μηνύματα & αιτήματα", href: "/vendor/advice", icon: "◌", vendorCapability: "customer_messages.manage" }] },
  { label: "Κατάστημα", href: "/vendor/storefront", icon: "◫", links: [{ label: "Δημόσιο προφίλ", href: "/vendor/storefront", icon: "◫", vendorCapability: "shop.manage" }] },
  { label: "Οικονομικά", href: "/vendor/finance", icon: "€", links: [{ label: "Πληρωμές & παραστατικά", href: "/vendor/finance", icon: "€", vendorCapability: "finance.read" }] },
  {
    label: "HUB εργαλεία", href: "/vendor/hub", icon: "◎",
    links: [
      { label: "HUB Control Centre", href: "/vendor/hub", icon: "◎", vendorCapability: "local_delivery.manage" }
    ]
  },
  {
    label: "Στατιστικά", href: "/vendor/analytics", icon: "∿",
    links: [
      { label: "Απόδοση", href: "/vendor/analytics", icon: "∿", vendorCapability: "analytics.read" },
      { label: "Αναφορές", href: "/vendor/reports", icon: "▤" }
    ]
  },
  { label: "Ρυθμίσεις", href: "/vendor/daily-access", icon: "⚙", links: [{ label: "Πρόσβαση στο Daily", href: "/vendor/daily-access", icon: "◈", vendorCapability: "staff.manage" }] }
];

/**
 * Admin navigation follows the operator's mental model rather than the code/module layout.
 * Existing URLs remain stable contracts: moving a link between visible domains does not rename
 * the route, permission, API, workflow state, database value or audit/event identifier.
 */
export const ADMIN_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Επισκόπηση",
    href: "/admin",
    icon: "overview",
    section: "Κέντρο ελέγχου",
    description: "Σήμερα, launch intelligence, εκκρεμότητες και γρήγορες ενέργειες",
    links: [
      { label: "Επισκόπηση", href: "/admin", icon: "⌂" },
      { label: "Launch Control", href: "/admin/launchcontrol/overview", icon: "◈", roles: ["super_admin"] },
      { label: "Targets & Pace", href: "/admin/launchcontrol/targets", icon: "◎", roles: ["super_admin"] },
      { label: "Αναζήτηση", href: "/admin/search", icon: "⌕", contextHidden: true }
    ]
  },
  {
    label: "Λειτουργίες",
    href: "/admin/work",
    icon: "operations",
    section: "Καθημερινή λειτουργία",
    description: "Παραγγελίες, delivery, SLA και εκκρεμότητες",
    links: [
      { label: "Κέντρο λειτουργιών", href: "/admin/work", icon: "◈", permission: "fulfilment.read" },
      { label: "Παραγγελίες", href: "/admin/orders", icon: "□", permission: "fulfilment.read" },
      { label: "Delivery", href: "/admin/delivery", icon: "⌁", permission: "fulfilment.write" },
      { label: "SLA & Escalations", href: "/admin/notifications", icon: "!", permission: "fulfilment.read" }
    ]
  },
  {
    label: "Πελάτες",
    href: "/admin/customers",
    icon: "customers",
    section: "Καθημερινή λειτουργία",
    description: "Customer 360, support και Ask Local",
    links: [
      { label: "Πελάτες", href: "/admin/customers", icon: "◉", permission: "customer.read" },
      { label: "Support", href: "/admin/customers/support", icon: "?", permission: "customer.read" },
      { label: "Ask Local", href: "/admin/ask-local", icon: "◎", permission: "customer.read" }
    ]
  },
  {
    label: "Συνεργάτες",
    href: "/admin/partners",
    icon: "partners",
    section: "Εμπορική διαχείριση",
    description: "Acquisition, onboarding, storefront και partner readiness",
    links: [
      { label: "Επισκόπηση", href: "/admin/partners", icon: "◎", permission: "vendor.manage" },
      { label: "Directory", href: "/admin/vendors", icon: "◉", permission: "vendor.manage" },
      { label: "Pipeline", href: "/admin/partners/pipeline", icon: "◌", permission: "vendor.manage" },
      { label: "Applications", href: "/admin/applications", icon: "▤", permission: "vendor.manage" },
      { label: "Prospects", href: "/admin/prospects", icon: "◌", permission: "vendor.manage" },
      { label: "Research", href: "/admin/research-vendors", icon: "⌕", permission: "vendor.manage" },
      { label: "Partner Network", href: "/admin/partner-network", icon: "◎", permission: "vendor.manage" },
      { label: "Storefront Design", href: "/admin/partners/design", icon: "◫", permission: "vendor.manage" },
      { label: "Agreements", href: "/admin/finance/agreements", icon: "%", permission: "finance.read", contextHidden: true },
      { label: "Agreement SLA", href: "/admin/finance/agreements/sla", icon: "⌛", permission: "finance.read", contextHidden: true }
    ]
  },
  {
    label: "Προϊόντα",
    href: "/admin/products",
    icon: "catalog",
    section: "Εμπορική διαχείριση",
    description: "Products, categories, quality, matching και catalogue operations",
    links: [
      { label: "Products & Categories", href: "/admin/products", icon: "▦", permission: "catalog.read" },
      { label: "Catalogue Operations", href: "/admin/catalogue", icon: "◎", permission: "catalog.read" },
      { label: "Quick Add", href: "/admin/quickadd", icon: "+", permission: "catalog.write" },
      { label: "Website Import", href: "/admin/catalogue-crawler", icon: "↗", permission: "catalog.read" },
      { label: "Source Import", href: "/admin/catalogue-intake/import", icon: "↑", permission: "catalog.write" },
      { label: "Supplier PIM", href: "/admin/catalogue-intake", icon: "⇩", permission: "catalog.read" },
      { label: "Attribute Mapping", href: "/admin/catalogue-intake/attributes", icon: "≡", permission: "catalog.read", contextHidden: true },
      { label: "Vendor Matching", href: "/admin/matching", icon: "◇", permission: "catalog.read", contextHidden: true },
      { label: "Structure", href: "/admin/catalogue/structure", icon: "≡", permission: "catalog.read" },
      { label: "Enrichment QA", href: "/admin/catalogue/enrichment", icon: "✓", permission: "catalog.read" },
      { label: "Brands", href: "/admin/catalogue/brands", icon: "◉", permission: "catalog.read" },
      { label: "Manufacturer DB", href: "/admin/catalogue/vitex", icon: "▤", permission: "catalog.read" },
      { label: "Catalogue Intelligence", href: "/admin/catalogue-intake/intelligence", icon: "◎", permission: "catalog.read", contextHidden: true },
      { label: "Attribute Matching", href: "/admin/catalogue/attribute-matching", icon: "≡", permission: "catalog.read", contextHidden: true },
      { label: "Attribute Review", href: "/admin/catalogue/attribute-review", icon: "!", permission: "catalog.read", contextHidden: true },
      { label: "Controlled Values", href: "/admin/catalogue-intake/values", icon: "≡", permission: "catalog.read", contextHidden: true },
      { label: "Categories & Policies", href: "/admin/categories", icon: "▦", permission: "catalog.read", contextHidden: true },
      { label: "Identity Exceptions", href: "/admin/catalogue/exceptions", icon: "!", permission: "catalog.read", contextHidden: true }
    ]
  },
  {
    label: "Οικονομικά & Tax",
    href: "/admin/finance",
    icon: "finance",
    section: "Εμπορική διαχείριση",
    description: "Payables, invoicing, agreements, VAT και AADE/myDATA",
    links: [
      { label: "Οικονομική επισκόπηση", href: "/admin/finance", icon: "€", permission: "finance.read" },
      { label: "Vendor Billing", href: "/admin/finance/vendor-billing", icon: "▤", permission: "finance.read" },
      { label: "Εμπορικές συμφωνίες", href: "/admin/finance/agreements", icon: "%", permission: "finance.read" },
      { label: "SLA συμφωνιών", href: "/admin/finance/agreements/sla", icon: "⌛", permission: "finance.read" },
      { label: "Tax & myDATA", href: "/admin/tax", icon: "#", permission: "finance.read" },
      { label: "Product VAT Profiles", href: "/admin/finance/mydata/products", icon: "≡", permission: "finance.read" },
      { label: "Gift Cards", href: "/admin/gift-cards", icon: "◇", permission: "finance.read", roles: ["super_admin"] }
    ]
  },
  {
    label: "Trust & Governance",
    href: "/admin/trust",
    icon: "trust",
    section: "Διακυβέρνηση & ανάπτυξη",
    description: "Compliance, safety, reviews, privacy, accessibility και fairness",
    links: [
      { label: "Trust & Compliance", href: "/admin/trust", icon: "✓", permission: "catalog.read" },
      { label: "Product Safety", href: "/admin/recalls", icon: "!", permission: "returns.read" },
      { label: "Reviews", href: "/admin/reviews", icon: "☆", permission: "reviews.read" },
      { label: "Privacy", href: "/admin/privacy", icon: "◐", permission: "privacy.read" },
      { label: "Accessibility", href: "/admin/accessibility", icon: "◎", permission: "accessibility.read" },
      { label: "Fairness", href: "/admin/fairness", icon: "⚖", permission: "fairness.read" }
    ]
  },
  {
    label: "Content & Visibility",
    href: "/admin/content",
    icon: "content",
    section: "Διακυβέρνηση & ανάπτυξη",
    description: "CMS, homepage, email και search visibility",
    links: [
      { label: "Content", href: "/admin/content", icon: "✎", permission: "content.read" },
      { label: "Homepage", href: "/admin/hero", icon: "▣", permission: "content.write" },
      { label: "Mailbox", href: "/admin/mail", icon: "✉", permission: "notifications.manage" },
      { label: "Templates & Delivery", href: "/admin/email-lab", icon: "✎", permission: "notifications.manage" },
      { label: "SEO Overview", href: "/admin/seo", icon: "⌕", permission: "content.read" },
      { label: "SEO Issues", href: "/admin/seo/issues", icon: "!", permission: "content.read" },
      { label: "SEO Pages", href: "/admin/seo/pages", icon: "▤", permission: "content.read" },
      { label: "Search Console", href: "/admin/seo/search-console", icon: "G", permission: "content.read" },
      { label: "Production", href: "/admin/seo/production", icon: "◉", permission: "content.read" },
      { label: "Crawl", href: "/admin/seo/crawl", icon: "↗", permission: "content.read", contextHidden: true },
      { label: "Sitemaps", href: "/admin/seo/sitemaps", icon: "≡", permission: "content.read", contextHidden: true },
      { label: "Google Coverage", href: "/admin/seo/search-console/index-coverage", icon: "◎", permission: "content.read", contextHidden: true },
      { label: "Schema", href: "/admin/seo/schema", icon: "◇", permission: "content.read" },
      { label: "Reports", href: "/admin/seo/reports", icon: "▤", permission: "content.read" }
    ]
  },
  {
    label: "Αναλύσεις",
    href: "/admin/analytics",
    icon: "analytics",
    section: "Διακυβέρνηση & ανάπτυξη",
    description: "Performance, demand intelligence και reports",
    links: [
      { label: "Performance", href: "/admin/analytics", icon: "∿", permission: "analytics.market.read" },
      { label: "Demand", href: "/admin/demand", icon: "◎", permission: "analytics.market.read" },
      { label: "Reports", href: "/admin/reports", icon: "▤", permission: "analytics.market.read" }
    ]
  },
  {
    label: "Πλατφόρμα",
    href: "/admin/platform",
    icon: "platform",
    section: "Σύστημα",
    description: "Health, audit, jobs, integrations και production readiness",
    links: [
      { label: "Overview", href: "/admin/platform", icon: "⚙", permission: "admin.audit.read" },
      { label: "Health & Audit", href: "/admin/operations", icon: "◉", permission: "admin.audit.read" },
      { label: "Jobs", href: "/admin/maintenance", icon: "⋯", permission: "admin.audit.read" },
      { label: "Production Readiness", href: "/admin/activation", icon: "◈", permission: "admin.audit.read" },
      { label: "BOX NOW", href: "/admin/shipping", icon: "↗", permission: "fulfilment.write", contextHidden: true }
    ]
  }
];

export const WORKSPACE_PAGE_ROUTES = [
  ...VENDOR_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href)),
  ...ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href))
] as const;

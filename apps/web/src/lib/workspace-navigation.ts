import type { Permission } from "@buy-local-sparta/core";

export type WorkspaceNavLink = Readonly<{
  label: string;
  href: string;
  icon: string;
  permission?: Permission;
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
  {
    label: "Αρχική",
    href: "/vendor",
    icon: "⌂",
    links: [{ label: "Αρχική", href: "/vendor", icon: "⌂" }]
  },
  {
    label: "Παραγγελίες",
    href: "/vendor/orders",
    icon: "□",
    links: [
      { label: "Παραγγελίες", href: "/vendor/orders", icon: "□" },
      { label: "Προθεσμίες", href: "/vendor/notifications", icon: "!" },
      { label: "Αποστολές", href: "/vendor/shipping", icon: "↗" },
      { label: "Παραλαβές", href: "/vendor/pickup/scan", icon: "⌁" },
      { label: "Επιστροφές", href: "/vendor/returns", icon: "↩" }
    ]
  },
  {
    label: "Προϊόντα",
    href: "/vendor/catalog",
    icon: "▦",
    links: [
      { label: "Κατάλογος & απόθεμα", href: "/vendor/catalog", icon: "▦" },
      { label: "Media & έγγραφα", href: "/vendor/trust", icon: "✓" }
    ]
  },
  {
    label: "Πελάτες",
    href: "/vendor/advice",
    icon: "◌",
    links: [{ label: "Μηνύματα & αιτήματα", href: "/vendor/advice", icon: "◌" }]
  },
  {
    label: "Κατάστημα",
    href: "/vendor/storefront",
    icon: "◫",
    links: [{ label: "Δημόσιο προφίλ", href: "/vendor/storefront", icon: "◫" }]
  },
  {
    label: "Οικονομικά",
    href: "/vendor/finance",
    icon: "€",
    links: [{ label: "Πληρωμές & παραστατικά", href: "/vendor/finance", icon: "€" }]
  },
  {
    label: "Στατιστικά",
    href: "/vendor/analytics",
    icon: "∿",
    links: [
      { label: "Απόδοση", href: "/vendor/analytics", icon: "∿" },
      { label: "Αναφορές", href: "/vendor/reports", icon: "▤" }
    ]
  },
  {
    label: "Ρυθμίσεις",
    href: "/vendor/daily-access",
    icon: "⚙",
    links: [{ label: "Πρόσβαση στο Daily", href: "/vendor/daily-access", icon: "◈" }]
  }
];

/**
 * Admin navigation follows the operator's mental model rather than the code/module layout.
 * Existing URLs remain stable contracts: moving a link between visible domains does not rename
 * the route, permission, API, workflow state, database value or audit/event identifier.
 * Nested routes stay registered for RBAC/deep-link access even when contextHidden keeps the
 * section bar focused on the most useful operator destinations.
 */
export const ADMIN_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Επισκόπηση",
    href: "/admin",
    icon: "overview",
    section: "Κέντρο ελέγχου",
    description: "Σήμερα, εκκρεμότητες και γρήγορες ενέργειες",
    links: [
      { label: "Επισκόπηση", href: "/admin", icon: "⌂" },
      { label: "Αναζήτηση", href: "/admin/search", icon: "⌕", contextHidden: true }
    ]
  },
  {
    label: "Λειτουργίες",
    href: "/admin/work",
    icon: "operations",
    section: "Καθημερινή λειτουργία",
    description: "Παραγγελίες, διανομή και SLA",
    links: [
      { label: "Κέντρο λειτουργιών", href: "/admin/work", icon: "◈", permission: "fulfilment.read" },
      { label: "Παραγγελίες", href: "/admin/orders", icon: "□", permission: "fulfilment.read" },
      { label: "Delivery Control", href: "/admin/delivery", icon: "⌁", permission: "fulfilment.write" },
      { label: "SLA & Escalations", href: "/admin/notifications", icon: "!", permission: "fulfilment.read" }
    ]
  },
  {
    label: "Πελάτες",
    href: "/admin/customers",
    icon: "customers",
    section: "Καθημερινή λειτουργία",
    description: "Πελάτες, Ask Local και υποστήριξη",
    links: [
      { label: "Κατάλογος πελατών", href: "/admin/customers", icon: "◉", permission: "customer.read" },
      { label: "Ask Local", href: "/admin/ask-local", icon: "◎", permission: "customer.read" },
      { label: "Υποστήριξη", href: "/admin/customers/support", icon: "?", permission: "customer.read" }
    ]
  },
  {
    label: "Συνεργάτες",
    href: "/admin/partners",
    icon: "partners",
    section: "Εμπορική διαχείριση",
    description: "Vendors, pipeline, onboarding και συμφωνίες",
    links: [
      { label: "Επισκόπηση συνεργατών", href: "/admin/partners", icon: "◎", permission: "vendor.manage" },
      { label: "Συνεργάτες", href: "/admin/vendors", icon: "◎", permission: "vendor.manage" },
      { label: "Pipeline", href: "/admin/partners/pipeline", icon: "◌", permission: "vendor.manage" },
      { label: "Applications", href: "/admin/applications", icon: "▤", permission: "vendor.manage" },
      { label: "Εμπορικές συμφωνίες", href: "/admin/finance/agreements", icon: "%", permission: "finance.read" },
      { label: "SLA συμφωνιών", href: "/admin/finance/agreements/sla", icon: "⌛", permission: "finance.read" },
      { label: "Research leads", href: "/admin/research-vendors", icon: "⌕", permission: "vendor.manage", contextHidden: true },
      { label: "Onboarding prospects", href: "/admin/prospects", icon: "◌", permission: "vendor.manage", contextHidden: true }
    ]
  },
  {
    label: "Κατάλογος",
    href: "/admin/matching",
    icon: "catalog",
    section: "Εμπορική διαχείριση",
    description: "Προϊόντα, intake, matching και taxonomy",
    links: [
      { label: "Quick Add", href: "/admin/quickadd", icon: "+", permission: "catalog.write" },
      { label: "Catalogue Intake", href: "/admin/catalogue-intake", icon: "⇩", permission: "catalog.read" },
      { label: "Source Import", href: "/admin/catalogue-intake/import", icon: "↑", permission: "catalog.write", contextHidden: true },
      { label: "Catalogue Crawler", href: "/admin/catalogue-crawler", icon: "↗", permission: "catalog.read" },
      { label: "Product Matching", href: "/admin/matching", icon: "◇", permission: "catalog.read" },
      { label: "Κατηγορίες & policies", href: "/admin/categories", icon: "▦", permission: "catalog.read" }
    ]
  },
  {
    label: "Οικονομικά",
    href: "/admin/finance",
    icon: "finance",
    section: "Εμπορική διαχείριση",
    description: "Settlements, vendor billing και myDATA",
    links: [
      { label: "Οικονομική επισκόπηση", href: "/admin/finance", icon: "€", permission: "finance.read" },
      { label: "Vendor Billing", href: "/admin/finance/vendor-billing", icon: "▤", permission: "finance.read" },
      { label: "Tax & myDATA", href: "/admin/tax", icon: "#", permission: "finance.read" }
    ]
  },
  {
    label: "Εμπιστοσύνη",
    href: "/admin/trust",
    icon: "trust",
    section: "Διακυβέρνηση & ανάπτυξη",
    description: "Trust, safety, privacy και fairness",
    links: [
      { label: "Trust review", href: "/admin/trust", icon: "✓", permission: "catalog.read" },
      { label: "Αξιολογήσεις", href: "/admin/reviews", icon: "☆", permission: "reviews.read" },
      { label: "Product Safety", href: "/admin/recalls", icon: "!", permission: "returns.read" },
      { label: "Privacy", href: "/admin/privacy", icon: "◐", permission: "privacy.read" },
      { label: "Accessibility", href: "/admin/accessibility", icon: "◎", permission: "accessibility.read" },
      { label: "Fairness", href: "/admin/fairness", icon: "⚖", permission: "fairness.read" }
    ]
  },
  {
    label: "Περιεχόμενο & SEO",
    href: "/admin/content",
    icon: "content",
    section: "Διακυβέρνηση & ανάπτυξη",
    description: "CMS, homepage, email και οργανική ορατότητα",
    links: [
      { label: "Content Operations", href: "/admin/content", icon: "✎", permission: "content.read" },
      { label: "Homepage", href: "/admin/hero", icon: "▣", permission: "content.write" },
      { label: "Email Templates", href: "/admin/email-lab", icon: "✉", permission: "notifications.manage" },
      { label: "SEO & Visibility", href: "/admin/seo", icon: "⌕", permission: "content.read" },
      { label: "SEO Pages", href: "/admin/seo/pages", icon: "▤", permission: "content.read", contextHidden: true },
      { label: "SEO Issues", href: "/admin/seo/issues", icon: "!", permission: "content.read", contextHidden: true },
      { label: "Crawl", href: "/admin/seo/crawl", icon: "↗", permission: "content.read", contextHidden: true },
      { label: "Sitemaps", href: "/admin/seo/sitemaps", icon: "≡", permission: "content.read", contextHidden: true },
      { label: "Search Console", href: "/admin/seo/search-console", icon: "G", permission: "content.read", contextHidden: true },
      { label: "Schema", href: "/admin/seo/schema", icon: "◇", permission: "content.read", contextHidden: true },
      { label: "SEO Reports", href: "/admin/seo/reports", icon: "▤", permission: "content.read", contextHidden: true }
    ]
  },
  {
    label: "Αναλύσεις",
    href: "/admin/analytics",
    icon: "analytics",
    section: "Διακυβέρνηση & ανάπτυξη",
    description: "Marketplace intelligence, demand και reports",
    links: [
      { label: "Analytics", href: "/admin/analytics", icon: "∿", permission: "analytics.market.read" },
      { label: "Demand Intelligence", href: "/admin/demand", icon: "◎", permission: "analytics.market.read" },
      { label: "Reports", href: "/admin/reports", icon: "▤", permission: "analytics.market.read" }
    ]
  },
  {
    label: "Πλατφόρμα",
    href: "/admin/platform",
    icon: "platform",
    section: "Σύστημα",
    description: "Health, integrations, jobs και launch readiness",
    links: [
      { label: "Platform overview", href: "/admin/platform", icon: "⚙", permission: "admin.audit.read" },
      { label: "System Health & Audit", href: "/admin/operations", icon: "◉", permission: "admin.audit.read" },
      { label: "BOX NOW Integration", href: "/admin/shipping", icon: "↗", permission: "fulfilment.write" },
      { label: "Jobs", href: "/admin/maintenance", icon: "⋯", permission: "admin.audit.read" },
      { label: "Launch Readiness", href: "/admin/activation", icon: "◈", permission: "admin.audit.read" }
    ]
  }
];

export const WORKSPACE_PAGE_ROUTES = [
  ...VENDOR_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href)),
  ...ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href))
] as const;

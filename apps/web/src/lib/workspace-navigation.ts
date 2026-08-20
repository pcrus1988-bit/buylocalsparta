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
}>;

export const VENDOR_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Σήμερα",
    links: [
      { label: "Επισκόπηση", href: "/vendor", icon: "⌂" },
      { label: "Ειδοποιήσεις", href: "/vendor/notifications", icon: "!" },
      { label: "Συμβουλές", href: "/vendor/advice", icon: "◌" },
      { label: "KONTA MOY Daily", href: "/vendor/daily-access", icon: "◈" }
    ]
  },
  {
    label: "Κατάλογος",
    links: [
      { label: "Προϊόντα & stock", href: "/vendor/catalog", icon: "▦" },
      { label: "Storefront", href: "/vendor/storefront", icon: "◫" },
      { label: "Φωτογραφίες & έγγραφα", href: "/vendor/trust", icon: "✓" }
    ]
  },
  {
    label: "Εκπλήρωση",
    links: [
      { label: "Αποστολές", href: "/vendor/shipping", icon: "↗" },
      { label: "Επιστροφές", href: "/vendor/returns", icon: "↩" }
    ]
  },
  {
    label: "Επιχείρηση",
    links: [
      { label: "Οικονομικά", href: "/vendor/finance", icon: "€" },
      { label: "Analytics", href: "/vendor/analytics", icon: "∿" },
      { label: "Reports", href: "/vendor/reports", icon: "▤" }
    ]
  }
];

/**
 * Admin navigation is organised by operator mental model rather than implementation module.
 * The sidebar renders one entry per group; the active group's links become contextual tabs.
 * Existing routes remain registered here so RBAC and deep links continue to work unchanged.
 */
export const ADMIN_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Επισκόπηση",
    href: "/admin",
    icon: "⌂",
    links: [
      { label: "Επισκόπηση", href: "/admin", icon: "⌂" },
      { label: "Αναζήτηση", href: "/admin/search", icon: "⌕", contextHidden: true }
    ]
  },
  {
    label: "Λειτουργίες",
    href: "/admin/work",
    icon: "◈",
    links: [
      { label: "Κέντρο λειτουργιών", href: "/admin/work", icon: "◈", permission: "fulfilment.read" },
      { label: "Παραγγελίες", href: "/admin/orders", icon: "□", permission: "fulfilment.read" },
      { label: "SLA & Escalations", href: "/admin/notifications", icon: "!", permission: "fulfilment.read" },
      { label: "Ask Local", href: "/admin/ask-local", icon: "◎", permission: "customer.read" },
      { label: "Υποστήριξη", href: "/admin/customers/support", icon: "?", permission: "customer.read" }
    ]
  },
  {
    label: "Συνεργάτες",
    href: "/admin/partners",
    icon: "◎",
    links: [
      { label: "Επισκόπηση συνεργατών", href: "/admin/partners", icon: "◎", permission: "vendor.manage" },
      { label: "Κατάλογος συνεργατών", href: "/admin/vendors", icon: "◎", permission: "vendor.manage" },
      { label: "Pipeline", href: "/admin/partners/pipeline", icon: "◌", permission: "vendor.manage" },
      { label: "Συμφωνίες", href: "/admin/finance/agreements", icon: "%", permission: "finance.read" },
      { label: "SLA συμφωνιών", href: "/admin/finance/agreements/sla", icon: "⌛", permission: "finance.read" },
      { label: "Research leads", href: "/admin/research-vendors", icon: "⌕", permission: "vendor.manage", contextHidden: true },
      { label: "Onboarding prospects", href: "/admin/prospects", icon: "◌", permission: "vendor.manage", contextHidden: true }
    ]
  },
  {
    label: "Κατάλογος",
    href: "/admin/matching",
    icon: "▦",
    links: [
      { label: "Product Matching", href: "/admin/matching", icon: "◇", permission: "catalog.read" },
      { label: "Κατηγορίες & policies", href: "/admin/categories", icon: "▦", permission: "catalog.read" }
    ]
  },
  {
    label: "Πελάτες",
    href: "/admin/customers",
    icon: "◉",
    links: [
      { label: "Πελάτες", href: "/admin/customers", icon: "◉", permission: "customer.read" }
    ]
  },
  {
    label: "Εμπιστοσύνη & Ασφάλεια",
    href: "/admin/trust",
    icon: "✓",
    links: [
      { label: "Review queue", href: "/admin/trust", icon: "✓", permission: "catalog.read" },
      { label: "Αξιολογήσεις", href: "/admin/reviews", icon: "☆", permission: "reviews.read" },
      { label: "Product Safety", href: "/admin/recalls", icon: "!", permission: "returns.read" },
      { label: "Privacy", href: "/admin/privacy", icon: "◐", permission: "privacy.read" },
      { label: "Fairness", href: "/admin/fairness", icon: "⚖", permission: "fairness.read" }
    ]
  },
  {
    label: "Οικονομικά & Φορολογία",
    href: "/admin/finance",
    icon: "€",
    links: [
      { label: "Settlements", href: "/admin/finance", icon: "€", permission: "finance.read" },
      { label: "Vendor Billing", href: "/admin/finance/vendor-billing", icon: "▤", permission: "finance.read" },
      { label: "Tax & myDATA", href: "/admin/tax", icon: "#", permission: "finance.read" }
    ]
  },
  {
    label: "Περιεχόμενο",
    href: "/admin/content",
    icon: "✎",
    links: [
      { label: "Pages & SEO", href: "/admin/content", icon: "✎", permission: "content.read" },
      { label: "Homepage", href: "/admin/hero", icon: "▣", permission: "content.write" },
      { label: "Email Templates", href: "/admin/email-lab", icon: "✉", permission: "notifications.manage" }
    ]
  },
  {
    label: "Αναλύσεις",
    href: "/admin/analytics",
    icon: "∿",
    links: [
      { label: "Analytics", href: "/admin/analytics", icon: "∿", permission: "analytics.market.read" },
      { label: "Reports", href: "/admin/reports", icon: "▤", permission: "analytics.market.read" }
    ]
  },
  {
    label: "Πλατφόρμα",
    href: "/admin/platform",
    icon: "⚙",
    links: [
      { label: "Platform overview", href: "/admin/platform", icon: "⚙", permission: "admin.audit.read" },
      { label: "System Health", href: "/admin/operations", icon: "◉", permission: "admin.audit.read" },
      { label: "Integrations · BOX NOW", href: "/admin/shipping", icon: "↗", permission: "fulfilment.write" },
      { label: "Jobs", href: "/admin/maintenance", icon: "⋯", permission: "admin.audit.read" },
      { label: "Launch Readiness", href: "/admin/activation", icon: "◈", permission: "admin.audit.read" }
    ]
  }
];

export const WORKSPACE_PAGE_ROUTES = [
  ...VENDOR_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href)),
  ...ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href))
] as const;

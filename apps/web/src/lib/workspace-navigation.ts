import type { Permission } from "@buy-local-sparta/core";

export type WorkspaceNavLink = Readonly<{ label: string; href: string; icon: string; permission?: Permission }>;
export type WorkspaceNavGroup = Readonly<{ label: string; links: ReadonlyArray<WorkspaceNavLink> }>;

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

export const ADMIN_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Σήμερα",
    links: [
      { label: "Επισκόπηση", href: "/admin", icon: "⌂" },
      { label: "Ειδοποιήσεις & SLA", href: "/admin/notifications", icon: "!", permission: "fulfilment.read" },
      { label: "Παραγγελίες", href: "/admin/orders", icon: "□", permission: "fulfilment.read" },
      { label: "Πελάτες", href: "/admin/customers", icon: "◉", permission: "customer.read" },
      { label: "Υποστήριξη πελατών", href: "/admin/customers/support", icon: "?", permission: "customer.read" },
      { label: "Αποστολές", href: "/admin/shipping", icon: "↗", permission: "fulfilment.write" }
    ]
  },
  {
    label: "Αγορά",
    links: [
      { label: "Έρευνα vendors", href: "/admin/research-vendors", icon: "⌕", permission: "vendor.manage" },
      { label: "Prospects", href: "/admin/prospects", icon: "◌", permission: "vendor.manage" },
      { label: "Συνεργάτες", href: "/admin/vendors", icon: "◎", permission: "vendor.manage" },
      { label: "Matching", href: "/admin/matching", icon: "◇", permission: "catalog.read" },
      { label: "Κατηγορίες", href: "/admin/categories", icon: "▦", permission: "catalog.read" },
      { label: "Περιεχόμενο", href: "/admin/content", icon: "✎", permission: "content.read" }
    ]
  },
  {
    label: "Εμπιστοσύνη",
    links: [
      { label: "Συμμόρφωση", href: "/admin/trust", icon: "✓", permission: "catalog.read" },
      { label: "Αξιολογήσεις", href: "/admin/reviews", icon: "☆", permission: "reviews.read" },
      { label: "Ανακλήσεις", href: "/admin/recalls", icon: "!", permission: "returns.read" },
      { label: "Ιδιωτικότητα", href: "/admin/privacy", icon: "◐", permission: "privacy.read" }
    ]
  },
  {
    label: "Διοίκηση",
    links: [
      { label: "Οικονομικά", href: "/admin/finance", icon: "€", permission: "finance.read" },
      { label: "Συμφωνίες vendors", href: "/admin/finance/agreements", icon: "%", permission: "finance.read" },
      { label: "SLA συμφωνιών", href: "/admin/finance/agreements/sla", icon: "⌛", permission: "finance.read" },
      { label: "Τιμολόγηση vendors", href: "/admin/finance/vendor-billing", icon: "▤", permission: "finance.read" },
      { label: "Φορολογία", href: "/admin/tax", icon: "#", permission: "finance.read" },
      { label: "Fairness", href: "/admin/fairness", icon: "⚖", permission: "fairness.read" },
      { label: "Analytics", href: "/admin/analytics", icon: "∿", permission: "analytics.market.read" },
      { label: "Reports", href: "/admin/reports", icon: "▤", permission: "analytics.market.read" }
    ]
  },
  {
    label: "Σύστημα",
    links: [
      { label: "Εργασίες", href: "/admin/maintenance", icon: "⋯", permission: "admin.audit.read" },
      { label: "Ενεργοποίηση", href: "/admin/activation", icon: "◈", permission: "admin.audit.read" },
      { label: "Λειτουργία", href: "/admin/operations", icon: "⚙", permission: "admin.audit.read" }
    ]
  }
];

export const WORKSPACE_PAGE_ROUTES = [
  ...VENDOR_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href)),
  ...ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href))
] as const;

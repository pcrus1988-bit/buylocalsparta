export type WorkspaceNavLink = Readonly<{ label: string; href: string; icon: string }>;
export type WorkspaceNavGroup = Readonly<{ label: string; links: ReadonlyArray<WorkspaceNavLink> }>;

export const VENDOR_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Σήμερα",
    links: [
      { label: "Επισκόπηση", href: "/vendor", icon: "⌂" },
      { label: "Συμβουλές", href: "/vendor/advice", icon: "◌" }
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
      { label: "Analytics", href: "/vendor/analytics", icon: "∿" }
    ]
  }
];

export const ADMIN_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Σήμερα",
    links: [
      { label: "Επισκόπηση", href: "/admin", icon: "⌂" },
      { label: "Ask Local", href: "/admin/ask-local", icon: "◌" },
      { label: "Παραγγελίες", href: "/admin/orders", icon: "□" },
      { label: "Αποστολές", href: "/admin/shipping", icon: "↗" }
    ]
  },
  {
    label: "Αγορά",
    links: [
      { label: "Έρευνα vendors", href: "/admin/research-vendors", icon: "⌕" },
      { label: "Συνεργάτες", href: "/admin/vendors", icon: "◎" },
      { label: "Matching", href: "/admin/matching", icon: "◇" },
      { label: "Κατηγορίες", href: "/admin/categories", icon: "▦" },
      { label: "Περιεχόμενο", href: "/admin/content", icon: "✎" }
    ]
  },
  {
    label: "Εμπιστοσύνη",
    links: [
      { label: "Συμμόρφωση", href: "/admin/trust", icon: "✓" },
      { label: "Αξιολογήσεις", href: "/admin/reviews", icon: "☆" },
      { label: "Ανακλήσεις", href: "/admin/recalls", icon: "!" },
      { label: "Ιδιωτικότητα", href: "/admin/privacy", icon: "◐" }
    ]
  },
  {
    label: "Διοίκηση",
    links: [
      { label: "Οικονομικά", href: "/admin/finance", icon: "€" },
      { label: "Συμφωνίες vendors", href: "/admin/finance/agreements", icon: "%" },
      { label: "Φορολογία", href: "/admin/tax", icon: "#" },
      { label: "Fairness", href: "/admin/fairness", icon: "⚖" },
      { label: "Analytics", href: "/admin/analytics", icon: "∿" }
    ]
  },
  {
    label: "Σύστημα",
    links: [
      { label: "Εργασίες", href: "/admin/maintenance", icon: "⋯" },
      { label: "Ενεργοποίηση", href: "/admin/activation", icon: "◈" },
      { label: "Λειτουργία", href: "/admin/operations", icon: "⚙" }
    ]
  }
];

export const WORKSPACE_PAGE_ROUTES = [
  ...VENDOR_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href)),
  ...ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href))
] as const;

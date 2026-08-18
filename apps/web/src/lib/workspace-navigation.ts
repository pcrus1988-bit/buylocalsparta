export type WorkspaceNavLink = Readonly<{ label: string; href: string }>;
export type WorkspaceNavGroup = Readonly<{ label: string; links: ReadonlyArray<WorkspaceNavLink> }>;

export const VENDOR_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Λειτουργία",
    links: [
      { label: "Επισκόπηση", href: "/vendor" },
      { label: "Κατάλογος", href: "/vendor/catalog" },
      { label: "Συμβουλές", href: "/vendor/advice" },
      { label: "Αποστολές", href: "/vendor/shipping" },
      { label: "Επιστροφές", href: "/vendor/returns" }
    ]
  },
  {
    label: "Επιχείρηση",
    links: [
      { label: "Αξιοπιστία", href: "/vendor/trust" },
      { label: "Οικονομικά", href: "/vendor/finance" },
      { label: "Analytics", href: "/vendor/analytics" }
    ]
  }
];

export const ADMIN_WORKSPACE_NAVIGATION: ReadonlyArray<WorkspaceNavGroup> = [
  {
    label: "Λειτουργία",
    links: [
      { label: "Επισκόπηση", href: "/admin" },
      { label: "Παραγγελίες", href: "/admin/orders" },
      { label: "Αποστολές", href: "/admin/shipping" },
      { label: "Εργασίες", href: "/admin/maintenance" },
      { label: "Ενεργοποίηση", href: "/admin/activation" }
    ]
  },
  {
    label: "Εμπόριο",
    links: [
      { label: "Έρευνα", href: "/admin/research-vendors" },
      { label: "Συνεργάτες", href: "/admin/vendors" },
      { label: "Matching", href: "/admin/matching" },
      { label: "Κατηγορίες", href: "/admin/categories" },
      { label: "Περιεχόμενο", href: "/admin/content" }
    ]
  },
  {
    label: "Εμπιστοσύνη",
    links: [
      { label: "Συμμόρφωση", href: "/admin/trust" },
      { label: "Αξιολογήσεις", href: "/admin/reviews" },
      { label: "Ανακλήσεις", href: "/admin/recalls" },
      { label: "Ιδιωτικότητα", href: "/admin/privacy" }
    ]
  },
  {
    label: "Διοίκηση",
    links: [
      { label: "Οικονομικά", href: "/admin/finance" },
      { label: "Φορολογία", href: "/admin/tax" },
      { label: "Fairness", href: "/admin/fairness" },
      { label: "Analytics", href: "/admin/analytics" },
      { label: "Σύστημα", href: "/admin/operations" }
    ]
  }
];

export const WORKSPACE_PAGE_ROUTES = [
  ...VENDOR_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href)),
  ...ADMIN_WORKSPACE_NAVIGATION.flatMap((group) => group.links.map((link) => link.href))
] as const;

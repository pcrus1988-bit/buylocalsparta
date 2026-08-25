"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./CustomerAccountExperience.module.css";

type AccountSection = {
  href: string;
  label: string;
  featured?: boolean;
};

type AccountGroup = {
  label: string;
  items: readonly AccountSection[];
};

const ACCOUNT_GROUPS: readonly AccountGroup[] = [
  {
    label: "Αγορές & παρακολούθηση",
    items: [
      { href: "/account", label: "Επισκόπηση" },
      { href: "/account/orders", label: "Παραγγελίες" },
      { href: "/account/saved", label: "Wishlist" },
      { href: "/account/notifications", label: "Ειδοποιήσεις" }
    ]
  },
  {
    label: "Τοπική βοήθεια",
    items: [
      { href: "/account/ask-local", label: "Ask Local", featured: true },
      { href: "/account/appointments", label: "Ραντεβού" },
      { href: "/account/support", label: "Υποστήριξη" }
    ]
  },
  {
    label: "Προφίλ & ασφάλεια",
    items: [
      { href: "/account/profile", label: "Προφίλ & διευθύνσεις" },
      { href: "/account/security", label: "Ασφάλεια" },
      { href: "/account/privacy", label: "Ιδιωτικότητα" }
    ]
  }
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountSectionNavigation() {
  const pathname = usePathname();

  return <nav className={`shell ${styles.accountNavigation}`} aria-label="Ενότητες λογαριασμού">
    <div className={styles.navFrame}>
      <div className={styles.navLead}>
        <span>Ο λογαριασμός μου</span>
        <strong>Μενού</strong>
      </div>
      <div className={styles.navGroups}>
        {ACCOUNT_GROUPS.map((group) => <section className={styles.navGroup} key={group.label} aria-label={group.label}>
          <span className={styles.navGroupLabel}>{group.label}</span>
          <div className={styles.navItems}>
            {group.items.map((section) => {
              const active = isActive(pathname, section.href);
              const className = [
                styles.navLink,
                active ? styles.navLinkActive : "",
                section.featured ? styles.navLinkFeatured : ""
              ].filter(Boolean).join(" ");

              return <Link
                className={className}
                aria-current={active ? "page" : undefined}
                href={section.href}
                key={section.href}
              >
                {section.label}
              </Link>;
            })}
          </div>
        </section>)}
      </div>
    </div>
  </nav>;
}

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
      { href: "/account/delivery", label: "Παράδοση" },
      { href: "/account/saved", label: "Αποθηκευμένα" },
      { href: "/account/gift-cards", label: "Δωροκάρτες" },
      { href: "/account/wishlist", label: "Wishlist" },
      { href: "/account/try-on", label: "Try On Me", featured: true },
      { href: "/account/documents", label: "Τα Έγγραφά μου" },
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

  // The account landing page has its own categorized card navigation.
  if (pathname === "/account") return null;

  return <nav className={`shell ${styles.accountNavigation}`} aria-label="Πλοήγηση λογαριασμού">
    <div className={styles.navBar}>
      <Link href="/account" className={styles.navBack}>← Επιστροφή στον λογαριασμό</Link>
      <details className={styles.navDisclosure}>
        <summary className={styles.navToggle}>Όλες οι ενότητες <span aria-hidden="true">⌄</span></summary>
        <div className={styles.navGroups}>
          {ACCOUNT_GROUPS.map((group) => <section className={styles.navGroup} key={group.label} aria-label={group.label}>
            <span className={styles.navGroupLabel}>{group.label}</span>
            <div className={styles.navItems}>
              {group.items.map((section) => {
                const active = isActive(pathname, section.href);
                return <Link
                  className={[styles.navLink, active ? styles.navLinkActive : "", section.featured ? styles.navLinkFeatured : ""].filter(Boolean).join(" ")}
                  aria-current={active ? "page" : undefined}
                  href={section.href}
                  key={section.href}
                >{section.label}</Link>;
              })}
            </div>
          </section>)}
        </div>
      </details>
    </div>
  </nav>;
}

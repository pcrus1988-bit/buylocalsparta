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

  const currentGroup = ACCOUNT_GROUPS.find((group) => group.items.some((item) => isActive(pathname, item.href)));
  const current = currentGroup?.items.find((item) => isActive(pathname, item.href));
  const nearby = currentGroup?.items.filter((item) => item.href !== "/account" && item.href !== current?.href).slice(0, 3) ?? [];

  return <nav className={`shell ${styles.accountNavigation}`} aria-label="Πλοήγηση λογαριασμού">
    <div className={styles.navBar}>
      <div className={styles.navLocation}>
        <Link href="/account" className={styles.navBack} aria-label="Επιστροφή στην αρχική σελίδα του λογαριασμού">← Ο λογαριασμός μου</Link>
        <span className={styles.navDivider} aria-hidden="true">/</span>
        <span className={styles.navCurrent} aria-current="page">{current?.label ?? "Ο λογαριασμός μου"}</span>
      </div>
      <details className={styles.navDisclosure}>
        <summary className={styles.navToggle}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg> Όλες οι ενότητες <span aria-hidden="true">⌄</span></summary>
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
    {nearby.length > 0 && <div className={styles.navNearby} aria-label="Σχετικές ενότητες">
      <span>Επίσης στον λογαριασμό:</span>
      {nearby.map((item) => <Link key={item.href} href={item.href}>{item.label} <span aria-hidden="true">↗</span></Link>)}
    </div>}
  </nav>;
}

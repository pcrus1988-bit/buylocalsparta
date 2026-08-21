"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY_ACCOUNT_SECTIONS = [
  { href: "/account", label: "Επισκόπηση" },
  { href: "/account/orders", label: "Παραγγελίες" },
  { href: "/account/ask-local", label: "Ask Local" },
  { href: "/account/saved", label: "Αποθηκευμένα" },
  { href: "/account/notifications", label: "Ειδοποιήσεις" },
  { href: "/account/profile", label: "Προφίλ & διευθύνσεις" },
  { href: "/account/security", label: "Ασφάλεια" },
  { href: "/account/privacy", label: "Ιδιωτικότητα" }
] as const;

const OVERVIEW_ACCOUNT_SECTIONS = [
  { href: "#overview", label: "Σύνοψη" },
  { href: "#ask-local", label: "Ask Local" },
  { href: "#orders", label: "Παραγγελίες" },
  { href: "#saved", label: "Αποθηκευμένα" },
  { href: "#notifications", label: "Ειδοποιήσεις" },
  { href: "#searches", label: "Αναζητήσεις" },
  { href: "#recommendations", label: "Προτάσεις" },
  { href: "#privacy", label: "Ιδιωτικότητα" },
  { href: "#recent", label: "Πρόσφατα" }
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountSectionNavigation() {
  const pathname = usePathname();
  return <nav className="shell customer-account-nav" aria-label="Ενότητες λογαριασμού">
    <div className="customer-account-nav-row">
      {PRIMARY_ACCOUNT_SECTIONS.map((section) => {
        const active = isActive(pathname, section.href);
        return <Link className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} href={section.href} key={section.href}>{section.label}</Link>;
      })}
      {pathname === "/account" && <details className="customer-account-nav-overview">
        <summary>Σε αυτή τη σελίδα</summary>
        <div>{OVERVIEW_ACCOUNT_SECTIONS.map((section) => <a href={section.href} key={section.href}>{section.label}</a>)}</div>
      </details>}
    </div>
  </nav>;
}
import Image from "next/image";
import Link from "next/link";
import styles from "./ResearchPublicNavigation.module.css";

type ResearchSection = "studies" | "overview" | "methodology" | "results" | "other-research" | "compare" | "privacy";

type Props = Readonly<{
  active?: ResearchSection;
  studySlug?: string;
}>;

/**
 * Public Research pages intentionally have their own navigation, independent of
 * the marketplace header, search, cart and account menus.
 * The KONTA MOY logo is the only header shortcut outside the Research section.
 */
export function ResearchPublicNavigation({ active, studySlug }: Props) {
  const studyRoot = studySlug ? `/research/${encodeURIComponent(studySlug)}` : null;
  const links: Array<{ href: string; label: string; section: ResearchSection }> = [
    { href: "/research", label: "Μελέτες", section: "studies" },
    ...(studyRoot ? [
      { href: studyRoot, label: "Επισκόπηση", section: "overview" as const },
      { href: `${studyRoot}/methodology`, label: "Μεθοδολογία", section: "methodology" as const },
      { href: `${studyRoot}/results`, label: "Αποτελέσματα", section: "results" as const }
    ] : []),
    { href: "/research/market-sentiment", label: "Άλλοι φορείς", section: "other-research" },
    { href: "/research/compare", label: "Σύγκριση", section: "compare" },
    { href: "/research/privacy", label: "Ιδιωτικότητα", section: "privacy" }
  ];

  return <header className={styles.bar}>
    <Link href="/" className={styles.brand} aria-label="KONTA MOY · Αρχική σελίδα">
      <Image src="/brand/kontamou-sparta-logo.webp" alt="" width={38} height={38} className={styles.logo} />
      <span className={styles.wordmark}>KONTA MOY</span>
    </Link>
    <span className={styles.divider} aria-hidden="true" />
    <Link href="/research" className={styles.researchTitle}>Έρευνα</Link>
    <nav className={styles.nav} aria-label="Πλοήγηση έρευνας">
      {links.map((link) => <Link
        href={link.href}
        key={link.href}
        aria-current={active === link.section ? "page" : undefined}
      >{link.label}</Link>)}
    </nav>
  </header>;
}

import type { Metadata } from "next";
import Link from "next/link";
import styles from "./hospitality.module.css";

const HOSPITALITY_ORIGIN = "https://hospitality.kontamou.site";

export const metadata: Metadata = {
  metadataBase: new URL(HOSPITALITY_ORIGIN),
  title: { default: "KONTA MOY Hospitality | Digital experiences for modern venues", template: "%s | KONTA MOY Hospitality" },
  description: "Η πύλη hospitality εφαρμογών του KONTA MOY. Γνώρισε το DrinkStock, τη διαδραστική εμπειρία δυναμικών τιμών για bars και χώρους διασκέδασης.",
  openGraph: {
    title: "KONTA MOY Hospitality",
    description: "One hospitality universe. DrinkStock is our first interactive application.",
    url: HOSPITALITY_ORIGIN,
    siteName: "KONTA MOY Hospitality",
    locale: "el_GR",
    type: "website"
  },
  robots: { index: false, follow: false }
};

export default function HospitalityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell} data-hospitality-root>
      <a className={styles.gatewaySkipLink} href="#main-content">Μετάβαση στο περιεχόμενο</a>
      <header className={styles.header}>
        <div className={styles.navigation}>
          <Link href={HOSPITALITY_ORIGIN} className={styles.brand} aria-label="KONTA MOY Hospitality – αρχική">
            <img src="/brand/kontamou-sparta-logo.webp" width={62} height={48} alt="KONTA MOY" />
            <span><strong>HOSPITALITY</strong><small>BY KONTA MOY</small></span>
          </Link>
          <nav aria-label="Hospitality navigation" className={styles.navLinks}>
            <Link href={`${HOSPITALITY_ORIGIN}/#applications`}>Εφαρμογές</Link>
            <Link href={`${HOSPITALITY_ORIGIN}/#how-it-works`} className={styles.gatewayNavSecondary}>Η φιλοσοφία μας</Link>
            <Link href={`${HOSPITALITY_ORIGIN}/drinkStock`}>DrinkStock <span aria-hidden="true">↗</span></Link>
            <Link href={`${HOSPITALITY_ORIGIN}/drinkStock/login`} className={styles.navLogin}>Partner Login</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        <span>© KONTA MOY Hospitality · Developed in Sparta for Greece</span>
        <div className={styles.gatewayFooterLinks}>
          <Link href={HOSPITALITY_ORIGIN}>Gateway</Link>
          <Link href={`${HOSPITALITY_ORIGIN}/drinkStock`}>DrinkStock</Link>
          <Link href={`${HOSPITALITY_ORIGIN}/drinkStock/login`}>Partner access</Link>
          <a href="https://kontamou.site">KONTA MOY Universe ↗</a>
        </div>
      </footer>
    </div>
  );
}

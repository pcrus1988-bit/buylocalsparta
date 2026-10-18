import type { Metadata } from "next";
import Link from "next/link";
import styles from "./hospitality.module.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hospitality.kontamou.site"),
  title: { default: "KONTA MOY Hospitality", template: "%s | KONTA MOY Hospitality" },
  description: "The KONTA MOY hospitality applications gateway.",
  robots: { index: false, follow: false }
};

export default function HospitalityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.navigation}>
          <Link href="/" className={styles.brand} aria-label="KONTA MOY Hospitality – αρχική">
            <img src="/brand/kontamou-sparta-logo.webp" width={62} height={48} alt="KONTA MOY" />
            <span><strong>HOSPITALITY</strong><small>BY KONTA MOY</small></span>
          </Link>
          <nav aria-label="Hospitality navigation" className={styles.navLinks}>
            <Link href="/">Εφαρμογές</Link>
            <Link href="/drinkStock">DrinkStock</Link>
            <Link href="/drinkStock/login" className={styles.navLogin}>Partner Login ↗</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        <span>© KONTA MOY · Developed in Sparta for Greece</span>
        <a href="https://kontamou.site">KONTA MOY Universe ↗</a>
      </footer>
    </div>
  );
}
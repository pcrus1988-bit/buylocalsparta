import type { Metadata } from "next";
import Link from "next/link";
import { ExchangeDemo } from "../../../components/ExchangeDemo";
import styles from "../hospitality.module.css";

export const metadata: Metadata = {
  title: "DrinkStock | Dynamic bar exchange",
  description: "Dynamic prices and interactive drink market concepts for hospitality venues.",
  robots: { index: false, follow: false }
};

export default function DrinkStockLanding() {
  return <main className={styles.main}>
    <section className={styles.hero}>
      <div className={styles.eyebrow}>KONTA MOY HOSPITALITY / DRINKSTOCK</div>
      <h1>THE BAR<br /><em>IS THE MARKET.</em></h1>
      <p>Μετατρέπουμε την τιμολόγηση ποτών σε διαδραστική εμπειρία. Ζωντανός πίνακας, ελεγχόμενες μεταβολές τιμών και αυτοτελής διαχείριση για κάθε επιχείρηση.</p>
      <div className={styles.actions}>
        <a href="#demo" className={styles.action}>Δοκίμασε το demo ↗</a>
        <Link href="/drinkStock/login" className={styles.secondaryAction}>Είσοδος συνεργάτη</Link>
      </div>
      <p className={styles.heroNote}>Υπό ανάπτυξη · Δεν γίνονται πραγματικές παραγγελίες ή πληρωμές.</p>
    </section>
    <div className={styles.demoWrap}><ExchangeDemo /></div>
    <section className={styles.features}>
      <h2>Χτισμένο γύρω από τον συνεργάτη.</h2>
      <div className={styles.featureGrid}>
        <article><strong>01 / Partner workspace</strong><p>Κάθε συνεργάτης έχει μόνο τα καταστήματα και το προσωπικό του.</p></article>
        <article><strong>02 / Dynamic pricing</strong><p>Ελεγχόμενοι κανόνες τιμολόγησης, όρια και παύση ανά χώρο.</p></article>
        <article><strong>03 / Live screens</strong><p>Οθόνες δυναμικών τιμών ανά συνεργαζόμενο venue.</p></article>
        <article><strong>04 / POS agnostic</strong><p>Ανεξάρτητη αρχιτεκτονική για μελλοντικές συνδέσεις με διαφορετικά POS.</p></article>
      </div>
    </section>
  </main>;
}
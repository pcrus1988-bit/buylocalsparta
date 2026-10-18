import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { ExchangeDemo } from "../../components/ExchangeDemo";
import styles from "./exchange.module.css";

export const metadata: Metadata = {
  title: "KONTA MOY EXCHANGE | Δυναμικές τιμές για χώρους εστίασης",
  description:
    "Γνωρίστε το KONTA MOY EXCHANGE: μια νέα εμπειρία ζωντανών, δυναμικών τιμών για bars, cafes και χώρους διασκέδασης.",
  alternates: { canonical: "/exchange" },
  // Prototype: do not let a demonstration page become a published service claim.
  robots: { index: false, follow: false },
};

const capabilities = [
  {
    index: "01",
    title: "Κέντρο διαχείρισης",
    copy: "Κατάλογος, όρια τιμών, κανόνες ζήτησης και έλεγχος ανά κατάστημα από μια ενιαία κονσόλα.",
  },
  {
    index: "02",
    title: "Οθόνες χρηματιστηρίου",
    copy: "Δυναμική προβολή για οθόνες και τηλεοράσεις, με τιμές που ενημερώνονται σε πραγματικό χρόνο.",
  },
  {
    index: "03",
    title: "Εμπειρία επισκέπτη",
    copy: "Πρόσβαση μέσω QR από κινητό, με μενού και ζωντανές ενδεικτικές τιμές στον χώρο.",
  },
  {
    index: "04",
    title: "Συνδέσεις POS αργότερα",
    copy: "Ανεξάρτητος πυρήνας, ώστε να μπορούν μελλοντικά να συνδεθούν διαφορετικά POS χωρίς εξάρτηση από έναν πάροχο.",
  },
] as const;

export default function ExchangePage() {
  return (
    <main className={styles.root}>
      <SiteHeader />
      <div className={styles.exchange}>
        <section className={styles.hero} aria-labelledby="exchange-heading">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <span className={styles.heroBadge}>ΜΙΑ ΝΕΑ ΙΔΕΑ ΜΕΣΑ ΣΤΟ KONTA MOY</span>
              <h1 id="exchange-heading">THE BAR<br /><em>IS THE MARKET.</em></h1>
              <p>
                Το KONTA MOY EXCHANGE μετατρέπει τις τιμές των ποτών σε μια διαδραστική εμπειρία.
                Περισσότερη ζήτηση, κίνηση στην αγορά και μια νέα μορφή διασκέδασης.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryAction} href="#demo">Δοκίμασε την προσομοίωση <span aria-hidden="true">↗</span></a>
                <a className={styles.secondaryAction} href="#concept">Πώς λειτουργεί <span aria-hidden="true">↓</span></a>
              </div>
              <div className={styles.heroFootnote}>ΠΡΩΤΟΤΥΠΟ · ΔΕΝ ΕΧΕΙ ΞΕΚΙΝΗΣΕΙ Η ΕΜΠΟΡΙΚΗ ΛΕΙΤΟΥΡΓΙΑ</div>
            </div>
            <div className={styles.heroVisual} aria-hidden="true">
              <div className={styles.visualHeader}>
                <span className={styles.statusDot} /> MARKET PREVIEW
                <span>EXCHANGE / 001</span>
              </div>
              <div className={styles.visualHeadline}>TONIGHT&apos;S<br />MARKET</div>
              <div className={styles.visualRows}>
                <div><span>01&nbsp; DRAFT BEER</span><b>€5.00</b><small>↗</small></div>
                <div><span>02&nbsp; MOJITO</span><b>€9.00</b><small>↗</small></div>
                <div><span>03&nbsp; SPRITZ</span><b>€8.00</b><small>↘</small></div>
                <div><span>04&nbsp; COLA</span><b>€3.50</b><small>↗</small></div>
              </div>
              <span className={styles.visualDisclaimer}>ILLUSTRATIVE DISPLAY · NOT LIVE PRICES</span>
            </div>
          </div>
        </section>

        <div className={styles.content}>
          <ExchangeDemo />
          <section className={styles.concept} id="concept" aria-labelledby="concept-heading">
            <div className={styles.conceptLead}>
              <span className={styles.eyebrow}>BUILT FOR HOSPITALITY</span>
              <h2 id="concept-heading">Ένα σύστημα.<br />Πολλές εμπειρίες.</h2>
              <p>
                Η τελική πλατφόρμα σχεδιάζεται ως ανεξάρτητη υπηρεσία του KONTA MOY,
                με διαχωρισμό καταστημάτων, διαχειριστών και επισκεπτών.
              </p>
            </div>
            <div className={styles.capabilityGrid}>
              {capabilities.map((item) => (
                <article className={styles.capabilityCard} key={item.index}>
                  <span>{item.index} / EXCHANGE</span>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </section>
          <section className={styles.closing}>
            <span>KONTA MOY UNIVERSE</span>
            <h2>Από το τοπικό εμπόριο στη ζωντανή εμπειρία.</h2>
            <p>Διακριτή εφαρμογή, κοινό οικοσύστημα. Σχεδιασμένο για σταδιακή ανάπτυξη με ασφάλεια και έλεγχο.</p>
            <a href="#exchange-heading">Επιστροφή στην αρχή ↑</a>
          </section>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
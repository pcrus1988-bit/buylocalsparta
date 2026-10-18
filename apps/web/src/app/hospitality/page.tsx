import Link from "next/link";
import styles from "./hospitality.module.css";

export default function HospitalityGateway() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>KONTA MOY UNIVERSE / HOSPITALITY</div>
        <h1>Hospitality,<br /><em>reimagined.</em></h1>
        <p>Ένα ενιαίο σημείο εισόδου για έξυπνες εφαρμογές bar, εστίασης και διασκέδασης. Σχεδιασμένο για επιχειρήσεις, ομάδες και επισκέπτες.</p>
      </section>
      <section aria-label="Hospitality applications" className={styles.appGrid}>
        <article className={styles.appCard}>
          <span className={styles.appNumber}>01 / ACTIVE DEVELOPMENT</span>
          <div className={styles.appSymbol} aria-hidden="true">↗</div>
          <h2>DrinkStock</h2>
          <p>Μια δυναμική αγορά τιμών για bars και χώρους διασκέδασης. Προσομοίωση ζήτησης, οθόνες τιμών και αποκλειστικοί χώροι συνεργατών.</p>
          <Link href="https://hospitality.kontamou.site/drinkStock" className={styles.action}>Εξερεύνησε το DrinkStock <span aria-hidden="true">→</span></Link>
        </article>
        <article className={styles.appCardMuted}>
          <span className={styles.appNumber}>THE PLATFORM / EXPANDING</span>
          <div className={styles.appSymbolMuted} aria-hidden="true">+</div>
          <h2>More applications.</h2>
          <p>Η πύλη έχει σχεδιαστεί ώστε να δέχεται νέες ανεξάρτητες εφαρμογές hospitality χωρίς αλλαγή λογαριασμού ή οικοσυστήματος.</p>
          <span className={styles.comingSoon}>Στο επόμενο στάδιο ανάπτυξης</span>
        </article>
      </section>
      <section className={styles.strip}><span>One ecosystem.</span><span>Partner-specific workspaces.</span><span>Designed to scale.</span></section>
    </main>
  );
}
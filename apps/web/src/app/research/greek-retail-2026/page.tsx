import type { Metadata } from "next";
import Link from "next/link";
import styles from "../../../components/ResearchSurveyPage.module.css";

export const metadata: Metadata = {
  title: "Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
  description: "Μελέτη για την ψηφιακή ετοιμότητα, τις λειτουργικές δυσκολίες και τις ανάγκες των ελληνικών εμπορικών επιχειρήσεων."
};

export default function GreekRetailResearchPage() {
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RESEARCH</div>
      <span>Greek Retail Observatory · Wave 2026</span>
      <h1>Ελληνικό Λιανεμπόριο 2026</h1>
      <p>Μια επαναλήψιμη μελέτη για το πώς λειτουργούν, ψηφιοποιούνται, προσεγγίζουν πελάτες και αντιμετωπίζουν καθημερινά εμπόδια οι ελληνικές εμπορικές επιχειρήσεις.</p>
      <div className={styles.meta}>
        <span>Η συμμετοχή γίνεται μόνο μέσω προσωπικής πρόσκλησης του δείγματος.</span>
        <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία & διαφάνεια</Link>
      </div>
    </header>
    <section className={styles.invalid}>
      <div className={styles.brand}>Τι μετράμε</div>
      <h2>Από την απλή παρουσία online έως την πραγματική ψηφιακή λειτουργία.</h2>
      <p>Η βασική μελέτη μετρά ψηφιακή ετοιμότητα, λειτουργική τριβή, απόκτηση πελατών, τοπικότητα, χρήση marketplaces και προθέσεις επένδυσης. Οι εμπορικές προτιμήσεις του KONTA MOY δεν αποτελούν μέρος των βασικών ερωτήσεων.</p>
      <Link href="/research/greek-retail-2026/methodology">Δείτε πώς θα μπορούν να αναπαραχθούν τα αποτελέσματα →</Link>
    </section>
  </main>;
}

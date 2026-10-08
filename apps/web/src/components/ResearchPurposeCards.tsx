import Link from "next/link";
import styles from "./ResearchPurposeCards.module.css";

const pillars = [
  {
    number: "01",
    title: "Τι θέλουμε να καταλάβουμε",
    description: "Πώς το κόστος, οι ψηφιακές δυνατότητες, η πρόσβαση στους πελάτες και οι πλατφόρμες πωλήσεων επηρεάζουν τις μικρές και ανεξάρτητες εμπορικές επιχειρήσεις."
  },
  {
    number: "02",
    title: "Τι κάνει τη μελέτη διαφορετική",
    description: "Δεν καταγράφουμε μόνο δυσκολίες. Εξετάζουμε τις ανάγκες ανά κλάδο, μέγεθος και περιοχή, αλλά και ποιες πρακτικές λύσεις θεωρούν οι επιχειρήσεις χρήσιμες."
  },
  {
    number: "03",
    title: "Γιατί έχει σημασία",
    description: "Οι απαντήσεις μπορούν να βοηθήσουν επιχειρήσεις, επιμελητήρια και δημόσιους φορείς να παίρνουν καλύτερα τεκμηριωμένες αποφάσεις για το μέλλον του εμπορίου."
  }
] as const;

const topics = [
  "Ψηφιακή παρουσία και πραγματικές πωλήσεις",
  "Λειτουργικό κόστος και προμήθειες",
  "Τοπική αγορά και προσέγγιση πελατών",
  "Συνεργασία με ψηφιακές πλατφόρμες",
  "Διαφορές μεταξύ κλάδων και περιοχών",
  "Πρακτικές ανάγκες και προτεραιότητες"
] as const;

export function ResearchPurposeCards({ compact = false }: { compact?: boolean }) {
  const headingId = compact ? "research-purpose-intro" : "research-purpose-overview";
  return <section className={[styles.root, compact ? styles.compact : styles.overview].join(" ")} aria-labelledby={headingId}>
    <div className={styles.heading}>
      <span className={styles.eyebrow}>Ελληνικό Λιανεμπόριο 2026 · Σκοπός της μελέτης</span>
      <h2 id={headingId}>{compact ? "Γιατί ζητάμε τη γνώμη σας;" : "Γιατί μελετάμε το ελληνικό λιανεμπόριο;"}</h2>
      <p>{compact
        ? "Θέλουμε να ακούσουμε τις πραγματικές εμπειρίες των εμπορικών επιχειρήσεων. Δείτε με μια ματιά τι εξετάζουμε και γιατί αξίζει η συμμετοχή σας."
        : "Θέλουμε να κατανοήσουμε τι δυσκολεύει την ανάπτυξη των ελληνικών εμπορικών επιχειρήσεων και τι μπορεί πραγματικά να τις βοηθήσει. Δεν αρκεί να γνωρίζουμε ότι υπάρχουν προβλήματα· αναζητούμε τις αιτίες και τις πιθανές λύσεις."}</p>
    </div>

    <div className={styles.cards}>
      {pillars.map((pillar) => <article className={styles.card} key={pillar.number}>
        <span className={styles.cardNumber} aria-hidden="true">{pillar.number}</span>
        <h3>{pillar.title}</h3>
        <p>{pillar.description}</p>
      </article>)}
    </div>

    {!compact && <div className={styles.topics}>
      <h3>Έξι βασικά θέματα που εξετάζουμε</h3>
      <ul>{topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
    </div>}

    <div className={styles.closing}>
      <p>{compact
        ? "Η συμμετοχή είναι προαιρετική. Οι απαντήσεις χρησιμοποιούνται για τη μελέτη και παρουσιάζονται συγκεντρωτικά. Η συμμετοχή δεν αποτελεί συγκατάθεση για εμπορική επικοινωνία."
        : "Επιδιώκουμε να παρουσιάζουμε τα ευρήματα με σαφή μεθοδολογία, στοιχεία για το δείγμα και τους περιορισμούς της ανάλυσης — ακόμη κι όταν τα αποτελέσματα διαφέρουν από τις αρχικές μας εκτιμήσεις."}</p>
      <div className={styles.links}>
        <Link href="/research/greek-retail-2026/methodology">Πώς γίνεται η έρευνα →</Link>
        <Link href="/research/privacy">Προστασία δεδομένων →</Link>
      </div>
    </div>
  </section>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/SiteFooter";
import styles from "../../../components/ResearchSurveyPage.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/privacy", {
    title: "Ιδιωτικότητα Έρευνας · KONTA MOY",
    description: "Πώς προστατεύονται η συμμετοχή, οι απαντήσεις και οι επιλογές επικοινωνίας στις έρευνες του KONTA MOY.",
    keywords: ["ιδιωτικότητα έρευνας", "προστασία δεδομένων έρευνας", "συγκατάθεση συμμετοχής", "ανώνυμες απαντήσεις λιανεμπορίου"]
  });
}

export default function ResearchPrivacyPage() {
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · ΙΔΙΩΤΙΚΟΤΗΤΑ ΕΡΕΥΝΑΣ</div>
      <span>Παρατηρητήριο Ελληνικού Λιανεμπορίου</span>
      <h1>Η συμμετοχή στην έρευνα είναι ξεχωριστή από την εμπορική επικοινωνία.</h1>
      <p>
        Η συμμετοχή είναι προαιρετική. Η επιλογή να συμμετάσχετε, να ενημερωθείτε για τα αποτελέσματα
        ή να λάβετε έναν κωδικό ευχαριστίας είναι ξεχωριστή από οποιαδήποτε εμπορική ενημέρωση του KONTA MOY.
      </p>
      <div className={styles.meta}>
        <Link href="/research">Παρατηρητήριο</Link>
        <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία 2026</Link>
      </div>
    </header>

    <section className={styles.invalid}>
      <div className={styles.brand}>Στοιχεία επικοινωνίας και απαντήσεις</div>
      <h2>Δεν χρησιμοποιούνται ως ένα ενιαίο αρχείο.</h2>
      <p>
        Τα στοιχεία που χρειάζονται για την πρόσκληση στη μελέτη διατηρούνται χωριστά από τις απαντήσεις
        που δίνετε στο ερωτηματολόγιο. Η ανάλυση της έρευνας δεν χρειάζεται να εμφανίζει το email ή την
        ταυτότητα της επιχείρησής σας μαζί με τις απαντήσεις.
      </p>
      <p>
        Ο προσωπικός σύνδεσμος βοηθά να αποφεύγονται διπλές συμμετοχές και, μετά την ολοκλήρωση,
        μπορεί να χρησιμοποιηθεί για να αλλάξετε τις προαιρετικές επιλογές επικοινωνίας σας χωρίς να αλλάξει η απάντησή σας.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Συγκατάθεση και ανάκληση</div>
      <h2>Οι επιλογές σας παραμένουν ξεχωριστές.</h2>
      <p>
        Μπορείτε να συμμετάσχετε χωρίς να ζητήσετε ενημέρωση αποτελεσμάτων ή κωδικό ευχαριστίας.
        Μπορείτε επίσης να ανακαλέσετε τη συμμετοχή σας για μελλοντικές αναλύσεις. Αποτελέσματα που έχουν ήδη
        δημοσιευθεί σε συγκεντρωτική μορφή παραμένουν μέρος της δημοσιευμένης μελέτης.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Διάρκεια διατήρησης</div>
      <h2>Τα στοιχεία δεν διατηρούνται επ' αόριστον.</h2>
      <p>
        Για κάθε μελέτη ορίζεται συγκεκριμένη περίοδος διατήρησης των στοιχείων που χρειάζονται για την πρόσκληση
        και την επαλήθευση της συμμετοχής. Όταν αυτή η περίοδος ολοκληρωθεί, τα στοιχεία που δεν είναι πλέον απαραίτητα
        παύουν να διατηρούνται σύμφωνα με την πολιτική της μελέτης.
      </p>
    </section>

    <SiteFooter />
  </main>;
}

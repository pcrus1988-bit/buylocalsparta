import type {Metadata} from "next";
import Link from "next/link";
import styles from "../legal.module.css";
import {legalOrder,legalRecords,legalUrl,PRIVACY_NOTICE_REVISION,PRIVACY_NOTICE_REVISED_ON} from "../../../lib/legal-documents";
import {MAZI_ARCHIVED_VERSION,MAZI_ARCHIVED_DATE,archivePageUrl,archiveExportUrl} from "../../../lib/legal/legal-archive";
export const metadata:Metadata={title:"Αρχείο και εκδόσεις νομικών κειμένων · ΜΑΖΙ",description:"Προηγούμενα δημοσιευμένα κείμενα, ιστορικά αποτυπώματα και ελεγχόμενες εκδόσεις πολιτικών ΜΑΖΙ."};
export default function LegalChanges(){
 return <main id="content" className={styles.page}>
 <section className={styles.hero}><div className="shell">
  <span className="eyebrow light">ΜΑΖΙ / ΝΟΜΙΚΟ ΑΡΧΕΙΟ</span>
  <h1>Καμία σιωπηρή αλλαγή.</h1>
  <p>Διατηρούμε αναγνώσιμες τις δημοσιευμένες εκδόσεις πολιτικών, ώστε το ισχύον κείμενο να μη συγχέεται με ιστορικά συμφωνητικά, προηγούμενη συναίνεση ή την αποδοχή όρων της πρόσκλησης.</p>
 </div></section>
 <div className={`shell ${styles.indexArea}`}>
  <div className={styles.indexLead}>
   <h2>Τι ακριβώς αποθηκεύεται</h2>
   <p>Έκδοση {MAZI_ARCHIVED_VERSION}, ημερομηνία {MAZI_ARCHIVED_DATE}: σταθερό στιγμιότυπο των 12 δημοσιευμένων πολιτικών και των 89 άρθρων τους. Κάθε έγγραφο παρέχεται ως HTML και ως αρχείο κειμένου με SHA-256 αποτύπωμα. Το αποτύπωμα πιστοποιεί μόνο συμφωνία περιεχομένου — όχι έγκυρη ηλεκτρονική υπογραφή ή ατομική αποδοχή.</p>
   <p>Οι χωριστά αποδεκτοί <Link href="/invitation-terms">όροι προσωπικής πρόσκλησης</Link> και <Link href="/marketplace/rules">όροι B2B Marketplace</Link> παραμένουν αυτοτελή κείμενα με δικό τους αναγνωριστικό αποδοχής. Το παρόν αρχείο δεν αντικαθιστά το απόρρητο τεκμήριο υποβολής/αποδοχής τους.</p>
  </div>
  <div className={styles.indexLead}>
   <h2>Επικαιροποίηση διαφάνειας τρίτων χωρών · {PRIVACY_NOTICE_REVISED_ON}</h2>
   <p>Η <Link href="/privacy">τρέχουσα Πολιτική Προσωπικών Δεδομένων</Link> επικαιροποιήθηκε με τον επαληθευμένο τόπο υποδομής της Supabase (us-east-1, ΗΠΑ), ενημέρωση για πιθανές βοηθητικές επεξεργασίες και παραπομπή στις δημοσιευμένες συμβατικές εγγυήσεις, χωρίς ατεκμηρίωτη δήλωση ότι συγκεκριμένο DPA ή μηχανισμός έχει επαληθευτεί στον λογαριασμό. Αναγνωριστικό: {PRIVACY_NOTICE_REVISION}.</p>
   <p>Η αλλαγή δεν αποτελεί νέους οικονομικούς/συμβατικούς όρους, δεν τροποποιεί σιωπηρά χωριστά συμφωνητικά και δεν καταχωρίζει φανταστική συγκατάθεση ή νομικό έλεγχο. Το ιστορικό νομικό αρχείο παραμένει προσβάσιμο.</p>
  </div>
  <div className={styles.cards}>{legalOrder.map(slug=><article key={slug} className={styles.card}>
   <span>ΑΡΧΕΙΟ · {MAZI_ARCHIVED_DATE}</span>
   <h3>{legalRecords[slug].title}</h3>
   <p><Link href={archivePageUrl(slug)}>Ιστορικό κείμενο</Link> · <Link href={archiveExportUrl(slug)}>Λήψη TXT</Link></p>
   <p><Link href={legalUrl(slug)}>Τρέχουσα έκδοση</Link></p>
  </article>)}</div>
  <div className={styles.summaryBox}>
   <h2>Προηγούμενη διατύπωση και ατομικές συμβάσεις</h2>
   <p>Η κωδικοποίηση v3.0 προηγήθηκε της v3.1. Η σελίδα αυτή δεν ισχυρίζεται ότι διαθέτει πλήρες ιστορικό όλων των ακόμη παλαιότερων διατυπώσεων· το παρόν σταθερό ψηφιακό αρχείο ξεκινά από την έκδοση v3.1. Προγενέστεροι ατομικά αποδεκτοί όροι και χρονοσφραγίδες πρέπει να διατηρούνται ανεξάρτητα στο κατάλληλο προσβάσιμο σε εξουσιοδοτημένους αρχείο.</p>
   <p><Link href="/legal/report">Ζήτησε πληροφορίες για το κείμενο που είχε ισχύ στη δική σου αποδοχή</Link>.</p>
  </div>
 </div></main>;
}

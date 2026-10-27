import type { Metadata } from "next";
import Link from "next/link";
import { legalOrder, legalRecords, legalUrl, LEGAL_DATE } from "../../lib/legal-documents";
import s from "./legal.module.css";
export const metadata:Metadata={title:"Νομικό Κέντρο · ΜΑΖΙ",description:"Όροι χρήσης, συνδρομές, Ταμείο Ανάπτυξης, προστασία δεδομένων, cookies και διατήρηση πληροφοριών."};
export default function LegalIndex(){
 return <main id="content" className={s.page}>
  <section className={s.hero}><div className="shell"><span className="eyebrow light">ΜΑΖΙ / ΝΟΜΙΚΟ ΚΕΝΤΡΟ</span><h1>Όλοι οι κανόνες.<br/>Σε κοινή θέα.</h1><p>Εδώ δημοσιεύουμε την ενημέρωση για τα δεδομένα και τα αναλυτικά προσχέδια του μελλοντικού οικονομικού πλαισίου, για να μπορεί κάθε επιχείρηση να γνωρίζει ακριβώς τι ισχύει — και τι δεν έχει ενεργοποιηθεί.</p><div className={s.heroMeta}><span>Τελευταία ενημέρωση {LEGAL_DATE}</span><span>Πριν από οικονομική έναρξη απαιτείται νομικός έλεγχος</span></div></div></section>
  <section className={`shell ${s.indexArea}`}>
   <div className={s.indexLead}><h2>Τα κείμενα</h2><p>Η προσωπική πρόσκληση εξακολουθεί να διέπεται από τους ξεχωριστούς <Link href="/invitation-terms">όρους πιλοτικής ένταξης</Link>. Τα υπόλοιπα οικονομικά κεφάλαια δημοσιεύονται ως προτεινόμενα, όχι ως συμβάσεις που έχουν ήδη υπογραφεί.</p></div>
   <div className={s.cards}>{legalOrder.map((key,i)=>{const doc=legalRecords[key];return <Link href={legalUrl(key)} className={s.card} key={key}><span>{String(i+1).padStart(2,"0")} / {doc.status==="current"?"ΤΡΕΧΟΥΣΑ ΕΝΗΜΕΡΩΣΗ":"ΠΡΟΣ ΕΓΚΡΙΣΗ"}</span><h3>{doc.title}</h3><p>{doc.summary}</p><b>Διάβασε το κείμενο ↗</b></Link>;})}<Link href="/marketplace/rules" className={s.card}><span>B2B / ΤΡΕΧΟΝΤΕΣ ΟΡΟΙ</span><h3>Όροι Αγοράς Φυσικών Ειδών</h3><p>23 κεφάλαια: συναλλαγές μεταξύ επιχειρήσεων, νόμιμη ευθύνη πωλητή, εγγυήσεις, επιστροφές, ασφάλεια προϊόντων και όρια ευθύνης ΚΟΝΤΑ ΜΟΥ.</p><b>Αναλυτικοί κανόνες Marketplace ↗</b></Link></div>
   <div className={s.summaryBox}><h2>Παροχές της σχεδιαζόμενης συνδρομής</h2><p><strong>€250/μήνα συνδρομή</strong> · KONTA ΜΟΥ HUB PRO με αναφερόμενη τιμή €99/μήνα στο /hubs/join · επιπλέον <strong>€250/μήνα πίστωση για υπηρεσίες κατόπιν αιτήματος.</strong> Προτείνεται επίσης χωριστός συλλογικός προϋπολογισμός marketing με λογοδοσία και δίκαιη προβολή. Η πίστωση ανανεώνεται μηνιαίως, δεν συσσωρεύεται και το αχρησιμοποίητο υπόλοιπο μηδενίζεται στο τέλος κάθε κύκλου. Δεν έχει ενεργοποιηθεί χρέωση.</p><Link href="/legal/marketing" className="text-link">Κανονισμός συλλογικής προβολής →</Link> · <Link href="/terms" className="text-link">Αναλυτικοί όροι συμμετοχής →</Link></div>
  </section>
 </main>;
}

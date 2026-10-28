import type { Metadata } from "next";
import Link from "next/link";
import { legalOrder, legalRecords, legalUrl, LEGAL_DATE } from "../../lib/legal-documents";
import s from "./legal.module.css";
export const metadata:Metadata={title:"Νομικό Κέντρο · ΜΑΖΙ",description:"Όροι χρήσης, συνδρομές, Ταμείο Ανάπτυξης, προστασία δεδομένων, cookies και διατήρηση πληροφοριών."};
export default function LegalIndex(){
 return <main id="content" className={s.page}>
  <section className={s.hero}><div className="shell"><span className="eyebrow light">ΜΑΖΙ / ΝΟΜΙΚΟ ΚΕΝΤΡΟ</span><h1>Όλοι οι κανόνες.<br/>Σε κοινή θέα.</h1><p>Κάθε νομικό αντικείμενο έχει τη δική του πολιτική. Οι Γενικοί Όροι ορίζουν τους κανόνες πρόσβασης και συμπεριφοράς· τα οικονομικά στοιχεία βρίσκονται αποκλειστικά στους Ειδικούς Όρους Συνδρομής, Υπηρεσιών, Ταμείου και Ενισχύσεων. Οι πολιτικές αλληλοπαραπέμπουν χωρίς επανάληψη συμβατικών ρητρών.</p><div className={s.heroMeta}><span>Έκδοση 3.1 · {LEGAL_DATE}</span><span>Ισχύοντες κανόνες πιλοτικής χρήσης και όροι επί πληρωμή συμμετοχής μετά από ατομική αποδοχή</span></div></div></section>
  <section className={`shell ${s.indexArea}`}>
   <div className={s.indexLead}><h2>Τα κείμενα</h2><p>Η προσωπική πρόσκληση εξακολουθεί να διέπεται από τους ξεχωριστούς <Link href="/invitation-terms">όρους πιλοτικής ένταξης</Link>. Οι κανονισμοί του οικονομικού προγράμματος δεν υποκαθιστούν χωριστή, καταγεγραμμένη αποδοχή ή πραγματική πληρωμή. Η δημοσίευση δεν δημιουργεί οικονομική δραστηριότητα που δεν έχει ακόμη συμβεί.</p></div>
   <div className={s.cards}>{legalOrder.map((key,i)=>{const doc=legalRecords[key];return <Link href={legalUrl(key)} className={s.card} key={key}><span>{String(i+1).padStart(2,"0")} / {doc.status==="current"?"ΤΡΕΧΟΥΣΑ ΕΝΗΜΕΡΩΣΗ":"ΚΑΝΟΝΙΣΜΟΣ ΠΡΟΓΡΑΜΜΑΤΟΣ"}</span><h3>{doc.title}</h3><p>{doc.summary}</p><b>Διάβασε το κείμενο ↗</b></Link>;})}<Link href="/marketplace/rules" className={s.card}><span>B2B / ΤΡΕΧΟΝΤΕΣ ΟΡΟΙ</span><h3>Όροι Αγοράς Φυσικών Ειδών</h3><p>23 κεφάλαια: συναλλαγές μεταξύ επιχειρήσεων, νόμιμη ευθύνη πωλητή, εγγυήσεις, επιστροφές, ασφάλεια προϊόντων και όρια ευθύνης ΚΟΝΤΑ ΜΟΥ.</p><b>Αναλυτικοί κανόνες Marketplace ↗</b></Link></div>
   <div className={s.summaryBox}><h2>Αναφορές και δικαιώματα</h2><p>Αναφορά πιθανού παράνομου περιεχομένου, επανεξέταση απόφασης ή άσκηση δικαιωμάτων προσωπικών δεδομένων: <Link href="/legal/report">Επικοινώνησε με το αρμόδιο σημείο επαφής →</Link>.</p></div><div className={s.summaryBox}>
    <h2>Ποια πολιτική πρέπει να διαβάσω;</h2>
    <p>Για τη χρήση λογαριασμού ξεκίνα από τους <Link href="/terms">Γενικούς Όρους</Link>. Για το εμπορικό τίμημα, τον ΦΠΑ, τις παροχές και την ακύρωση διάβασε αποκλειστικά τους <Link href="/legal/membership">Ειδικούς Όρους Συνδρομής</Link>. Για αιτήματα εργασιών, διάρκεια και λήξη μονάδων: <Link href="/legal/services">Κανονισμός Υπηρεσιών</Link>. Για τις χρηματοδοτικές προτάσεις: <Link href="/legal/fund">Κανονισμός Ταμείου</Link> και <Link href="/legal/award">Ειδική Σύμβαση Ενίσχυσης</Link>.</p>
    <p>Οι ήδη αποδεκτοί <Link href="/invitation-terms">Όροι Πιλοτικής Πρόσκλησης</Link> και οι χωριστοί <Link href="/marketplace/rules">Όροι B2B Marketplace</Link> παραμένουν ανεξάρτητοι. Η δημοσίευση ενημερωμένης πολιτικής δεν θεωρείται από μόνη της ατομική οικονομική αποδοχή.</p>
   </div>
  </section>
 </main>;
}

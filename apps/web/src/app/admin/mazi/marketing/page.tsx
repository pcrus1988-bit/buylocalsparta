import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Συλλογικό Marketing · Admin",robots:{index:false,follow:false}};
const checks=[
 ["Σύμβαση, ΦΠΑ και εισπράξεις","Χωριστή αποδοχή όρων, εγκεκριμένη βάση διανομής, έλεγχος τιμολογίου, εξοφλημένες περιόδοι και αντιλογισμοί."],
 ["Χωριστός λογιστικός μηχανισμός","Καθολικό marketing διακριτό από το Αναπτυξιακό Ταμείο, αμετάβλητο audit, τεκμήρια δαπανών, συμφωνίες και ελεγχόμενα δικαιώματα."],
 ["Διαφημιστικός λογαριασμός και ασφάλεια","Πιστοποιημένη σύνδεση με τους παρόχους, κανόνες προϋπολογισμού, ανεξάρτητα δικαιώματα, pause/stop και έλεγχος δημιουργικών."],
 ["Αναλογική και δίκαιη προβολή","Επιλεξιμότητα επιχείρησης, προϊόντα και τοπική συνάφεια, άδειες, προηγούμενη έκθεση, τεκμηριωμένες εξαιρέσεις."],
 ["Πραγματική μέτρηση και δημοσίευση","Επαληθευμένα λογιστικά στοιχεία, συγκεντρωτικός δημόσιος απολογισμός, απομόνωση δεδομένων μέλους και audit σφαλμάτων."]
] as const;
export default async function MaziMarketingAdmin(){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.denied}><h1>Πρόσβαση μόνο για τον Super Admin</h1><p>Το περιβάλλον marketing ανήκει αποκλειστικά στον ΚΟΝΤΑ ΜΟΥ Super Admin.</p><Link href="/admin">Επιστροφή</Link></div></main>;
 return <main className={s.stage}><div className={s.shell}>
 <div className={s.breadcrumb}><Link href="/admin">ΚΟΝΤΑ ΜΟΥ / ADMIN</Link><span>↗</span><Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span><span>MARKETING</span></div>
 <header className={s.hero}><div><p className={s.kicker}>SOLE SUPER ADMIN · MARKETING CONTROL</p><h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Συλλογική Προβολή</em></h1><p className={s.subtitle}>Το διοικητικό σημείο ελέγχου για συλλογικές online/offline καμπάνιες, κανόνες δίκαιης προβολής και τη μελλοντική οικονομική διαφάνεια.</p></div><div className={s.lock}><strong>ΜΗ ΕΝΕΡΓΟΠΟΙΗΜΕΝΟ</strong><span>Δεν έχει ενεργοποιηθεί προϋπολογισμός marketing, πληρωμένη διαφήμιση ή καταγραφή εισφορών για την υπηρεσία.</span><Link href="/admin/mazi/operations">Έλεγχοι λειτουργίας ↗</Link><a href="https://mazi.kontamou.site/marketing" rel="noreferrer" target="_blank">Δημόσιο πρόγραμμα ↗</a></div></header>
 <section className={s.section}><div className={s.sectionTop}><div><p>01 / ECONOMIC STATUS</p><h2>Οικονομική ετοιμότητα</h2></div><span>Καμία εικονική δαπάνη ή υπόλοιπο</span></div><div className={s.empty}><strong>Χωρίς ενεργοποιημένο οικονομικό καθολικό marketing.</strong><p>Πριν εμφανιστούν μετρήσεις, πρέπει να προκύπτουν από πραγματικές συμφωνημένες εισπράξεις και επαληθευμένα παραστατικά. Η προτεινόμενη κατανομή 20% της συνδρομής πριν από ΦΠΑ δεν είναι διαθέσιμο προς δαπάνη υπόλοιπο.</p></div></section>
 <section className={s.section}><div className={s.sectionTop}><div><p>02 / RELEASE GATES</p><h2>Απαιτήσεις πριν από καμπάνιες</h2></div><span>Υποχρεωτικές διακριτές εγκρίσεις</span></div><div className={s.stack}>{checks.map(([title,description],i)=><article className={s.member} key={title}><div><strong>{String(i+1).padStart(2,"0")} · {title}</strong><span>{description}</span></div><span className={s.tag}>ΕΚΚΡΕΜΕΙ</span></article>)}</div></section>
 <section className={s.section}><div className={s.sectionTop}><div><p>03 / NEXT OPERATIONS</p><h2>Διοίκηση και διαφάνεια</h2></div><span>Μέχρι τη διασύνδεση, μόνο αναγνωστική ετοιμότητα</span></div><p className={s.disclaimer}>Η διαχείριση καμπανιών, προτιμήσεων μελών, εγκρίσεων δημιουργικού, πραγματικών αποδόσεων, αποδείξεων και αναφορών θα ενεργοποιηθεί μόνο όταν υπάρχει ανεξάρτητα επαληθευμένο καθολικό και ασφαλής διασύνδεση με παρόχους. Η οθόνη αυτή δεν επιτρέπει μεταφορές, χρεώσεις ή αγορές διαφημιστικού χρόνου.</p><div className={s.buttons}><Link className={s.secondary} href="/admin/mazi">Επιστροφή στο ΜΑΖΙ</Link><Link className={s.secondary} href="/admin/mazi/operations">Επιχειρησιακός έλεγχος</Link></div></section>
 </div></main>;
}

import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Κέντρο βοήθειας",
  description: "Βρες τη σωστή διαδρομή για προϊόντα, Ask Local, παραγγελίες, παράδοση, λογαριασμό και συμμετοχή καταστήματος.",
  alternates: { canonical: "/help" }
};

const helpPaths = [
  ["Ψάχνω προϊόν", "Χρησιμοποίησε τον κατάλογο και τα φίλτρα ή πέρασε κατευθείαν σε κατηγορία.", "/shop", "Άνοιξε τον κατάλογο"],
  ["Δεν βρίσκω αυτό που θέλω", "Περιέγραψε την ανάγκη σου και παρακολούθησε το ιδιωτικό αίτημα από τον λογαριασμό σου.", "/ask-local", "Χρησιμοποίησε Ask Local"],
  ["Έχω ήδη παραγγελία", "Οι αγορές, οι καταστάσεις και οι διαθέσιμες ενέργειες βρίσκονται στον λογαριασμό πελάτη.", "/account", "Δες τις παραγγελίες"],
  ["Θέλω επιστροφή ή ακύρωση", "Ξεκίνα από τη συγκεκριμένη παραγγελία και δες ποια ενέργεια επιτρέπει η τρέχουσα κατάσταση.", "/returns-refunds", "Δες τη διαδρομή επιστροφής"],
  ["Έχω απορία για την πληρωμή", "Μάθε πώς υπολογίζεται το σύνολο, πότε μεταφέρεσαι στη Viva και πώς επιβεβαιώνεται η αγορά.", "/payments-security", "Πληρωμές & ασφάλεια"],
  ["Θέλω να καταλάβω την παράδοση", "Δες πότε εφαρμόζεται παραλαβή από κατάστημα, locker ή άλλη διαθέσιμη αποστολή.", "/delivery-pickup", "Παράδοση & παραλαβή"],
  ["Θέλω να αλλάξω privacy ρυθμίσεις", "Δες τι κάνουν οι προτάσεις, τα πρόσφατα προϊόντα και το αίτημα εξαγωγής δεδομένων.", "/privacy-controls", "Άνοιξε τον οδηγό controls"],
  ["Πώς επιλέγεται το κατάστημα;", "Διάβασε τι είναι canonical προϊόν και ποιοι κανόνες διέπουν τη δίκαιη ανάθεση.", "/fairness", "Δες τους κανόνες"],
  ["Έχω κατάστημα στη Σπάρτη", "Κάνε readiness check και δες τι χρειάζεται πριν από το ελεγχόμενο onboarding.", "/join/requirements", "Έλεγξε την ετοιμότητα"]
] as const;

export default function HelpPage() {
  return <main>
    <div className="announcement">Βοήθεια με πραγματική συνέχεια — όχι σύνδεσμοι που σε γυρίζουν απλώς στην αρχική.</div>
    <SiteHeader />
    <section className="content-hero content-hero-help"><div className="shell content-hero-grid"><div><div className="eyebrow light">Κέντρο βοήθειας</div><h1>Τι θέλεις να κάνεις;</h1><p>Διάλεξε την κατάσταση που σε περιγράφει και πήγαινε απευθείας στην κατάλληλη λειτουργία ή αναλυτική σελίδα.</p></div><div className="help-compass" aria-hidden="true"><span>?</span><small>FIND YOUR NEXT STEP</small></div></div></section>
    <section className="shell content-section"><div className="help-grid">{helpPaths.map(([title, body, href, action], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h2>{title}</h2><p>{body}</p><a className="text-link" href={href}>{action} →</a></article>)}</div></section>
    <section className="content-band"><div className="shell content-section content-section-on-dark"><div className="content-heading"><div><div className="eyebrow light">Συχνές ερωτήσεις</div><h2>Σύντομες, καθαρές απαντήσεις</h2></div></div><div className="faq-list"><details><summary>Αγοράζω από κάθε κατάστημα ξεχωριστά;</summary><p>Όχι. Ο πελάτης ολοκληρώνει μία αγορά προς το ΚΟΝΤΑ ΜΟΥ Sparta. Οι επιμέρους συνεργάτες εκπλήρωσης οργανώνονται ιδιωτικά στο παρασκήνιο.</p></details><details><summary>Γιατί βλέπω μόνο μία καταχώριση για το ίδιο προϊόν;</summary><p>Η πλατφόρμα ενοποιεί τα ίδια είδη σε canonical προϊόν. Αυτό κρατά τον κατάλογο καθαρό και αποφεύγει δημόσιο ανταγωνισμό μεταξύ τοπικών προμηθευτών για το ίδιο αντικείμενο.</p></details><details><summary>Είναι δημόσια η ερώτησή μου στο Ask Local;</summary><p>Όχι. Το αίτημα συνδέεται με τον λογαριασμό σου και δρομολογείται ιδιωτικά σύμφωνα με το πλαίσιο προϊόντος, καταστήματος ή γενικής ανάγκης.</p></details><details><summary>Πότε πρέπει να πάω στο κατάστημα για παραλαβή;</summary><p>Μόνο αφού η σχετική κατάσταση παραγγελίας επιβεβαιώσει ότι η παραλαβή είναι έτοιμη. Η αρχική διαθεσιμότητα προϊόντος δεν ισοδυναμεί με έτοιμη παραγγελία.</p></details><details><summary>Πού βρίσκω μια προηγούμενη αγορά;</summary><p>Στον λογαριασμό πελάτη. Από εκεί ανοίγεις τη συγκεκριμένη παραγγελία και βλέπεις τις γραμμές, τις καταστάσεις και τις διαθέσιμες ενέργειες.</p></details></div></div></section>
    <section className="shell content-cta"><div><div className="eyebrow">Θέλεις ανθρώπινη καθοδήγηση πριν αγοράσεις;</div><h2>Βρες σύμβουλο ή στείλε ιδιωτικό αίτημα.</h2></div><div className="hero-actions"><a className="button" href="/advice">Βρες σύμβουλο</a><a className="button button-secondary" href="/ask-local">Ask Local</a></div></section>
    <SiteFooter />
  </main>;
}

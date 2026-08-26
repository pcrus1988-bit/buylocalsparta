import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/returns-refunds", {
  title: "Επιστροφές & επιστροφές χρημάτων",
  description: "Η πραγματική διαδρομή ακύρωσης, επιστροφής, ελέγχου και αποκατάστασης μιας παραγγελίας στο ΚΟΝΤΑ ΜΟΥ Σπάρτη."
  });
}

const stages = [
  ["01", "Άνοιξε τη συγκεκριμένη παραγγελία", "Ο λογαριασμός είναι η πηγή αλήθειας για κατάσταση, γραμμές προϊόντων και επιτρεπόμενες ενέργειες. Ξεκίνα πάντα από εκεί, όχι από μια γενική φόρμα."],
  ["02", "Διάλεξε το σωστό αίτημα", "Πριν ξεκινήσει η φυσική παράδοση μπορεί να εμφανίζεται ακύρωση. Μετά το handover χρησιμοποιείται η ροή επιστροφής ή υπαναχώρησης, σύμφωνα με την περίπτωση."],
  ["03", "Περίμενε εξουσιοδότηση", "Όταν χρειάζεται φυσική επιστροφή, το αίτημα αποκτά οδηγίες και κωδικό RMA. Μην αποστείλεις προϊόν σε κατάστημα χωρίς επιβεβαιωμένη διαδρομή."],
  ["04", "Έλεγχος και λύση", "Η παραλαβή και ο έλεγχος καταγράφονται χωριστά. Η διαθέσιμη λύση μπορεί να είναι επιστροφή χρημάτων, αντικατάσταση, επισκευή ή άλλη νόμιμη αποκατάσταση."],
  ["05", "Ολοκλήρωση με ίχνος", "Η τελική κατάσταση ενημερώνεται στην παραγγελία. Τα καταστήματα χειρίζονται μόνο τις ανατεθειμένες εργασίες· η έγκριση επιστροφής χρημάτων παραμένει ελεγχόμενη λειτουργία πλατφόρμας."]
] as const;

export default function ReturnsRefundsPage() {
  return <main>
    <div className="announcement">Η επιστροφή ξεκινά από την παραγγελία και καταλήγει σε καταγεγραμμένη λύση.</div>
    <SiteHeader compact />
    <section className="content-hero content-hero-returns"><div className="shell content-hero-grid"><div><div className="eyebrow light">After-sales χωρίς αδιέξοδο</div><h1>Ακύρωση, επιστροφή και αποκατάσταση με σαφή στάδια.</h1><p>Δεν χρειάζεται να μαντέψεις ποιο κατάστημα εκπλήρωσε τι. Η ενιαία παραγγελία κρατά το σωστό πλαίσιο και εμφανίζει τις ενέργειες που είναι διαθέσιμες στη συγκεκριμένη κατάσταση.</p><div className="hero-actions"><Link className="button button-light" href="/account">Άνοιξε τις παραγγελίες σου</Link><Link className="button content-outline" href="/help">Βρες τη σωστή βοήθεια</Link></div></div><div className="returns-path" aria-hidden="true"><span>ORDER</span><i>RMA</i><span>REMEDY</span></div></div></section>
    <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">Η λειτουργική διαδρομή</div><h2>Από το αίτημα μέχρι το κλείσιμο.</h2></div><p>Τα βήματα που εμφανίζονται εξαρτώνται από το είδος του αιτήματος, την κατάσταση παράδοσης και την απαιτούμενη επιθεώρηση.</p></div><div className="process-list">{stages.map(([number, title, body]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div></section>
    <section className="content-band"><div className="shell content-split"><div><div className="eyebrow light">Ποια ενέργεια ταιριάζει;</div><h2>Άλλο ακύρωση, άλλο επιστροφή.</h2><p>Η ακύρωση αφορά παραγγελία που δεν έχει περάσει το επιτρεπόμενο σημείο παράδοσης. Η επιστροφή αφορά προϊόν μετά την εκπλήρωση. Ελαττωματικό, λανθασμένο ή μη σύμφωνο προϊόν μπορεί να χρειάζεται διαφορετικό evidence και λύση από μια απλή αλλαγή γνώμης.</p></div><div className="content-fact-list"><div><strong>Πριν το handover</strong><span>Άνοιξε την παραγγελία και έλεγξε αν εμφανίζεται η ενέργεια ακύρωσης.</span></div><div><strong>Μετά την παραλαβή</strong><span>Χρησιμοποίησε τη ροή επιστροφής που συνδέεται με τη συγκεκριμένη γραμμή προϊόντος.</span></div><div><strong>Επιστροφή χρημάτων</strong><span>Η έγκριση και η εκτέλεση είναι χωριστά ελεγχόμενα στάδια· η κατάσταση της υπόθεσης παραμένει ορατή.</span></div></div></div></section>
    <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">Πριν ξεκινήσεις</div><h2>Κράτησε το σωστό πλαίσιο.</h2></div><p>Οι παρακάτω πληροφορίες επιταχύνουν την αναγνώριση της σωστής γραμμής και του σωστού fulfilment.</p></div><div className="principle-grid"><article><span>ORDER</span><h3>Αριθμός παραγγελίας</h3><p>Μπες στον λογαριασμό και άνοιξε τη συγκεκριμένη αγορά. Μην βασίζεσαι μόνο στο όνομα προϊόντος.</p></article><article><span>ITEM</span><h3>Προϊόν και ποσότητα</h3><p>Αν μια αγορά έχει πολλές γραμμές, επίλεξε ακριβώς ποιο προϊόν και πόσες μονάδες αφορά το αίτημα.</p></article><article><span>EVIDENCE</span><h3>Κατάσταση και τεκμήρια</h3><p>Περιέγραψε με ακρίβεια τι συνέβη και διατήρησε συσκευασία ή τεκμήρια όταν είναι σχετικά με την εξέταση.</p></article></div></section>
    <section className="shell content-cta"><div><div className="eyebrow">Συνέχισε με πραγματική ενέργεια</div><h2>Άνοιξε την αγορά που αφορά το αίτημα.</h2><p>Αν δεν εμφανίζεται κατάλληλη ενέργεια, χρησιμοποίησε το Κέντρο βοήθειας έχοντας έτοιμο τον αριθμό παραγγελίας.</p></div><div className="hero-actions"><Link className="button" href="/account">Οι παραγγελίες μου</Link><Link className="button button-secondary" href="/delivery-pickup">Καταστάσεις παράδοσης</Link></div></section>
    <SiteFooter />
  </main>;
}

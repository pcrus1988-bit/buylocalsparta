import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Δίκαιη ανάθεση καταστημάτων",
  description: "Πώς το Buy Local Sparta εμφανίζει ένα προϊόν μία φορά και αναθέτει δίκαια την εκπλήρωση σε επιλέξιμο τοπικό κατάστημα.",
  alternates: { canonical: "/fairness" }
};

const rules = [
  ["Επιλεξιμότητα πρώτα", "Ενεργό κατάστημα, εγκεκριμένη προσφορά, κατάλληλη τοποθεσία, διαθέσιμο απόθεμα και ολοκληρωμένοι έλεγχοι."],
  ["Ισορροπημένη έκθεση", "Όταν περισσότεροι συνεργάτες μπορούν να εκτελέσουν το ίδιο προϊόν, ο μηχανισμός λαμβάνει υπόψη την προηγούμενη επιλέξιμη έκθεση."],
  ["Καταλληλότητα εκπλήρωσης", "Το απόθεμα, η φρεσκάδα της ενημέρωσης και η δυνατότητα εξυπηρέτησης λειτουργούν ως πραγματικοί περιορισμοί."],
  ["Συνεπής εμπειρία", "Η επιλογή δεν αλλάζει τυχαία μέσα στο ίδιο ταξίδι. Η σχετική ανάθεση παραμένει σταθερή μέχρι το checkout."],
  ["Καμία αγορά προτεραιότητας", "Η πληρωμή συνδρομής ή η κρυφή supplier τιμή δεν μετατρέπεται σε δημόσια κατάταξη για το ίδιο canonical προϊόν."],
  ["Ελέγξιμο ιστορικό", "Οι αποφάσεις ανάθεσης και οι διοικητικές παρεμβάσεις διατηρούν καταγεγραμμένο ίχνος για έλεγχο και επίλυση διαφορών."]
] as const;

export default function FairnessPage() {
  return <main>
    <div className="announcement">Fair Vendor Exposure · καθαρή αγορά για τον πελάτη, ισότιμη συμμετοχή για τον τοπικό επαγγελματία.</div>
    <SiteHeader />
    <section className="content-hero content-hero-fairness"><div className="shell content-hero-grid"><div><div className="eyebrow light">Ένα προϊόν · καθαροί κανόνες</div><h1>Δεν στήνουμε δημόσιο πόλεμο τιμών ανάμεσα στους γείτονες.</h1><p>Τα ίδια αντικείμενα ενοποιούνται σε ένα canonical προϊόν. Ο πελάτης βλέπει μία παρουσία και μία τελική τιμή, ενώ η επιλέξιμη τοπική εκπλήρωση ανατίθεται στο παρασκήνιο.</p><div className="hero-actions"><a className="button button-light" href="/shop">Δες τον ενιαίο κατάλογο</a><a className="button content-outline" href="/shops">Γνώρισε τα καταστήματα</a></div></div><div className="fairness-orbit" aria-hidden="true"><span>ONE</span><strong>PRODUCT</strong><small>FAIR LOCAL ROUTING</small></div></div></section>
    <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">Οι κανόνες</div><h2>Τι επηρεάζει την ανάθεση</h2></div><p>Η δημόσια εμπειρία δεν αποκαλύπτει ιδιωτικές εμπορικές πληροφορίες και δεν επιτρέπει στον χρήστη να παρακάμψει τον μηχανισμό μέσω προϊόντος.</p></div><div className="principle-grid">{rules.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="content-band"><div className="shell content-split"><div><div className="eyebrow light">Τι βλέπει ο πελάτης</div><h2>Απλότητα μπροστά. Διακυβέρνηση πίσω.</h2><p>Η τιμή που εμφανίζεται είναι η δημόσια τιμή της πλατφόρμας. Η ταυτότητα του συμβούλου ή συνεργάτη εκπλήρωσης εμφανίζεται μόνο όταν αυτό επιτρέπεται από την ενεργή ανάθεση και τους δημόσιους κανόνες.</p></div><div className="content-fact-list"><div><strong>Δεν εμφανίζονται</strong><span>Κρυφές supplier τιμές, παράλληλες προσφορές ή εσωτερικά fairness scores.</span></div><div><strong>Δεν επιτρέπεται</strong><span>Προτίμηση προμηθευτή σε προϊόν που πρέπει να ανατεθεί δίκαια.</span></div><div><strong>Επιτρέπεται</strong><span>Ιδιωτικό αίτημα σε συγκεκριμένο κατάστημα όταν δεν συνδέεται με canonical προϊόν.</span></div></div></div></section>
    <section className="shell content-cta"><div><div className="eyebrow">Έχεις συγκεκριμένη ανάγκη;</div><h2>Το Ask Local εφαρμόζει τους ίδιους κανόνες.</h2><p>Σύνδεσε ένα προϊόν για δίκαιη ανάθεση ή περιέγραψε μια γενική ανάγκη για ιδιωτική δρομολόγηση.</p></div><a className="button" href="/ask-local">Άνοιξε το Ask Local</a></section>
    <SiteFooter />
  </main>;
}

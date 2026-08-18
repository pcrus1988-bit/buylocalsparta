import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";

export const metadata: Metadata = {
  title: "Γίνε συνεργάτης",
  description: "Μάθε ποια καταστήματα μπορούν να συμμετέχουν, τι προσφέρει η πλατφόρμα και ποια είναι τα πραγματικά στάδια ενεργοποίησης.",
  alternates: { canonical: "/join" }
};

const steps = [
  ["01", "Αίτηση", "Υποβάλλεις τα πραγματικά στοιχεία της επιχείρησης. Η αίτηση καταχωρίζεται σε verification pending — χωρίς vendor access."],
  ["02", "Επαλήθευση & κατάλογος", "Ελέγχουμε επιχείρηση/τοποθεσία και οργανώνουμε προϊόντα, stock, φωτογραφίες και περιγραφές χωρίς δημόσιο ανταγωνισμό για το ίδιο προϊόν."],
  ["03", "Συμβουλή & δοκιμή", "Ορίζουμε ποιος μπορεί να απαντά σε ερωτήσεις και ολοκληρώνουμε test readiness σε catalog, stock, fulfilment και policies."],
  ["04", "Ενεργοποίηση", "Μόνο Admin ενεργοποιεί vendor business, location και vendor-owner access αφού ολοκληρωθούν οι έλεγχοι και οι συμφωνημένοι όροι."]
] as const;

const benefits = [
  ["Κοινή ψηφιακή βιτρίνα", "Προϊόντα και κατάστημα εντάσσονται στην οργανωμένη τοπική αγορά χωρίς να χρειάζεται να συντηρείς μόνος σου ολόκληρο marketplace."],
  ["Πραγματικό merchant profile", "Η ιστορία, οι άνθρωποι, η τοποθεσία και οι κατηγορίες σου εμφανίζονται μόνο με τη δική σου έγκριση."],
  ["Κατάλογος και stock", "Εργαλεία εισαγωγής, media governance, product matching, απόθεμα και παραγγελίες μέσα από το vendor workspace."],
  ["Συμβουλή και Ask Local", "Ιδιωτικές ερωτήσεις και αιτήματα που έχουν ανατεθεί στο κατάστημά σου, χωρίς δημόσιο bidding."],
  ["Εκπλήρωση και οικονομική εικόνα", "Παραγγελίες, παραλαβές, αποστολές, supplier invoices και settlements με σαφή διαχωρισμό ρόλων."],
  ["Δίκαιη συμμετοχή", "Τα ίδια προϊόντα ενοποιούνται και η επιλέξιμη εκπλήρωση ακολουθεί τον μηχανισμό Fair Vendor Exposure."]
] as const;

export default function JoinPage() {
  return <main>
    <div className="announcement">Για καταστήματα της Σπάρτης και της ευρύτερης περιοχής.</div>
    <SiteHeader compact />
    <section className="shell page-hero"><div className="eyebrow">Merchant onboarding</div><h1>Μπες στην τοπική αγορά χωρίς να χάσεις την ταυτότητά σου.</h1><p className="lead">Το Buy Local Sparta σχεδιάστηκε ώστε το κατάστημα, οι άνθρωποι και η τεχνογνωσία του να παραμένουν ορατά — ενώ ο πελάτης έχει μία ενιαία και καθαρή εμπειρία αγοράς.</p><div className="hero-actions"><a className="button" href="/join/apply">Ξεκίνα αίτηση</a><a className="button button-secondary" href="/join/requirements">Κάνε readiness check</a><a className="text-link" href="/fairness">Δες τη δίκαιη ανάθεση →</a></div><p className="section-note">Η αίτηση καταχωρίζεται στην παραγωγική ουρά verification. Δεν δημιουργεί αυτόματα συνεργάτη ή πρόσβαση στο vendor dashboard.</p></section>
    <section className="content-band" id="eligibility"><div className="shell content-split"><div><div className="eyebrow light">Ποιοι μπορούν να συμμετέχουν</div><h2>Τοπικά μη διατροφικά καταστήματα.</h2><p>Η πιλοτική αγορά εστιάζει σε ενεργές επιχειρήσεις της Σπάρτης και της καθορισμένης γύρω περιοχής. Η τελική συμμετοχή προϋποθέτει επαλήθευση επιχείρησης, τοποθεσίας, κατηγορίας, δικαιωμάτων περιεχομένου και συμφωνημένων εμπορικών όρων.</p></div><div className="content-fact-list"><div><strong>Χρειάζεται</strong><span>Νόμιμη επιχείρηση, πραγματικό σημείο ή επιλέξιμη περιοχή εξυπηρέτησης και υπεύθυνος λογαριασμού.</span></div><div><strong>Ελέγχεται</strong><span>Κατηγορία, στοιχεία KYB, δικαιώματα εικόνων, συμμόρφωση προϊόντων και δυνατότητα εκπλήρωσης.</span></div><div><strong>Δεν αρκεί</strong><span>Μία απλή δημόσια καταχώριση ή η αποστολή προϊόντων χωρίς ολοκλήρωση των activation gates.</span></div></div></div></section>
    <section className="shell section">
      <div className="section-heading"><div><div className="eyebrow">Πώς ξεκινάμε</div><h2>Onboarding με πραγματικούς ελέγχους</h2></div><p className="section-note">Η πρόσκληση και η αίτηση δεν ισοδυναμούν με δημόσια ενεργοποίηση. Κάθε στάδιο ολοκληρώνεται με καταγεγραμμένο έλεγχο.</p></div>
      <div className="category-grid">{steps.map(([number,title,body]) => <article className="category-card" key={number}><span className="category-mark">{number}</span><span><strong>{title}</strong><small>{body}</small></span></article>)}</div>
    </section>
    <section className="section section-tint"><div className="shell"><div className="section-heading"><div><div className="eyebrow">Τι αποκτά το κατάστημα</div><h2>Ένα πραγματικό λειτουργικό workspace.</h2></div><p className="section-note">Οι δυνατότητες ενεργοποιούνται σύμφωνα με τον ρόλο, το πλάνο και την ολοκλήρωση των απαιτούμενων ελέγχων.</p></div><div className="principle-grid">{benefits.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
    <section className="shell ask-local section"><div><div className="eyebrow">Pilot phase</div><h2>Founding / Early Bird</h2><p>Η εγκεκριμένη configuration του build διατηρεί το Founding / Early Bird πλαίσιο. Η αίτηση μπορεί να δηλώσει ενδιαφέρον, αλλά χρέωση, σύμβαση και ενεργοποίηση γίνονται μόνο μετά την αποδοχή των τελικών όρων.</p><div className="hero-actions"><a className="button" href="/join/apply">Υπόβαλε αίτηση Founding</a><a className="button button-secondary" href="/about">Η αποστολή της πλατφόρμας</a></div></div><div className="fairness-note"><strong>Είσαι ήδη εγκεκριμένος συνεργάτης;</strong><p>Συνδέσου στο προστατευμένο vendor workspace. Η δημόσια αίτηση οδηγεί μόνο σε verification και όχι σε shortcut ενεργοποίησης.</p><a className="text-link" href="/vendor/login">Είσοδος συνεργαζόμενου καταστήματος →</a></div></section>
    <SiteFooter />
  </main>;
}
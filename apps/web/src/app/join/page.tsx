import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Γίνε συνεργάτης",
  description: "Μάθε πώς ένα τοπικό κατάστημα της Σπάρτης μπορεί να συμμετέχει στο Buy Local Sparta."
};

const steps = [
  ["01", "Γνωριμία", "Επιβεβαιώνουμε το κατάστημα, την κατηγορία και τον τρόπο που θέλεις να εξυπηρετείς πελάτες."],
  ["02", "Κατάλογος", "Οργανώνουμε προϊόντα, stock, φωτογραφίες και περιγραφές χωρίς να δημιουργούμε δημόσιο ανταγωνισμό για το ίδιο προϊόν."],
  ["03", "Συμβουλή", "Ορίζουμε ποιος από την ομάδα σου μπορεί να απαντά σε ερωτήσεις, chats και ραντεβού."],
  ["04", "Ενεργοποίηση", "Η ενεργοποίηση γίνεται μόνο αφού ολοκληρωθούν οι έλεγχοι onboarding και οι συμφωνημένοι εμπορικοί/νομικοί όροι."]
] as const;

export default function JoinPage() {
  return <main>
    <div className="announcement">Για καταστήματα της Σπάρτης και της ευρύτερης περιοχής.</div>
    <SiteHeader compact />
    <section className="shell page-hero"><div className="eyebrow">Merchant onboarding</div><h1>Μπες στην τοπική αγορά χωρίς να χάσεις την ταυτότητά σου.</h1><p className="lead">Το Buy Local Sparta σχεδιάστηκε ώστε το κατάστημα, οι άνθρωποι και η τεχνογνωσία του να παραμένουν ορατά — ενώ ο πελάτης έχει μία ενιαία και καθαρή εμπειρία αγοράς.</p></section>
    <section className="shell section">
      <div className="section-heading"><div><div className="eyebrow">Πώς ξεκινάμε</div><h2>Onboarding με πραγματικούς ελέγχους</h2></div><p className="section-note">Η production φόρμα αίτησης δεν παρακάμπτει τα ήδη υλοποιημένα verification/KYB και activation gates.</p></div>
      <div className="category-grid">{steps.map(([number,title,body]) => <article className="category-card" key={number}><span className="category-mark">{number}</span><span><strong>{title}</strong><small>{body}</small></span></article>)}</div>
    </section>
    <section className="shell ask-local section"><div><div className="eyebrow">Pilot phase</div><h2>Founding / Early Bird</h2><p>Η εγκεκριμένη configuration του build διατηρεί το Founding / Early Bird πλαίσιο· οι τελικοί συμβατικοί, φορολογικοί και PSP όροι παραμένουν launch gates και δεν παρουσιάζονται ως ήδη ενεργοί.</p></div><div className="fairness-note"><strong>Δεν δημοσιεύουμε μη εγκεκριμένη standard τιμολόγηση.</strong><p>Η σελίδα αυτή είναι ενημερωτική μέχρι να συνδεθεί η production αίτηση με το ήδη υλοποιημένο onboarding workflow.</p><a className="text-link" href="/vendor/login">Είσοδος συνεργαζόμενου καταστήματος →</a></div></section>
  </main>;
}

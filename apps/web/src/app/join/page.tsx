import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Γίνε συνεργάτης",
  description: "Σύγκρινε τα προγράμματα συνεργασίας, δες ποια καταστήματα μπορούν να συμμετέχουν και ξεκίνα την ελεγχόμενη αίτηση συνεργασίας.",
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

const plans = [
  { code: "founding_2026", name: "Founding Partner", eyebrow: "Περιορισμένο · έως 50 συνεργάτες", setup: "€1.500", recurring: "€0", commission: "2%", commitment: "36 μήνες", bestFor: "Για καταστήματα που θέλουν να μπουν στην πρώτη ομάδα με το χαμηλότερο ποσοστό προμήθειας.", note: "Προστατευμένο Founding Partner καθεστώς για 36 μήνες, χωρίς επαναλαμβανόμενη συνδρομή.", featured: true },
  { code: "annual", name: "Annual", eyebrow: "Καλύτερη ισορροπία κόστους", setup: "€299", recurring: "€399 / έτος", commission: "5%", commitment: "Ετήσιο", bestFor: "Για ενεργά καταστήματα που θέλουν χαμηλό αρχικό κόστος και χαμηλότερη προμήθεια από το Monthly.", note: "Σταθερό ετήσιο πρόγραμμα με πλήρη πρόσβαση στις βασικές λειτουργίες του marketplace.", featured: false },
  { code: "monthly", name: "Monthly", eyebrow: "Μέγιστη ευελιξία", setup: "€499", recurring: "€49 / μήνα", commission: "7%", commitment: "Μηνιαίο", bestFor: "Για καταστήματα που προτιμούν μηνιαία συνεργασία και μεγαλύτερη ευελιξία στη διάρκεια.", note: "Μηνιαία συνεργασία χωρίς ετήσια δέσμευση, με πλήρη πρόσβαση στις βασικές λειτουργίες marketplace.", featured: false }
] as const;

export default function JoinPage() {
  return <main>
    <div className="announcement">Για καταστήματα της Σπάρτης και της ευρύτερης περιοχής.</div>
    <SiteHeader compact />
    <section className="shell page-hero">
      <div className="eyebrow">Merchant onboarding</div>
      <h1>Μπες στην τοπική αγορά χωρίς να χάσεις την ταυτότητά σου.</h1>
      <p className="lead">Το Buy Local Sparta σχεδιάστηκε ώστε το κατάστημα, οι άνθρωποι και η τεχνογνωσία του να παραμένουν ορατά — ενώ ο πελάτης έχει μία ενιαία και καθαρή εμπειρία αγοράς.</p>
      <div className="hero-actions"><a className="button" href="#plans">Σύγκρινε προγράμματα</a><a className="button button-secondary" href="/join/apply?plan=annual">Ξεκίνα αίτηση</a><a className="text-link" href="/join/requirements">Readiness check →</a></div>
      <p className="section-note">Διάλεξε πρώτα το πρόγραμμα που ταιριάζει στο κατάστημά σου. Η επιλογή μεταφέρεται στην αίτηση και μπορείς να την αλλάξεις πριν την υποβολή.</p>
    </section>

    <section className={`shell section ${styles.planSection}`} id="plans" aria-labelledby="plans-title">
      <div className={styles.planIntro}>
        <div className={styles.planIntroText}><div className="eyebrow">Προγράμματα συνεργασίας</div><h2 id="plans-title">Σύγκρινε πριν κάνεις αίτηση.</h2><p>Και τα τρία προγράμματα δίνουν πρόσβαση στο marketplace και στο vendor workspace. Η βασική διαφορά είναι το κόστος ένταξης, η επαναλαμβανόμενη συνδρομή, η διάρκεια και η προμήθεια πωλήσεων.</p></div>
        <p className="section-note">Επίλεξε πρόγραμμα για να συνεχίσεις στην αίτηση με το συγκεκριμένο πλάνο ήδη προεπιλεγμένο.</p>
      </div>
      <div className={styles.planGrid}>{plans.map((plan) => <article className={`${styles.planCard} ${plan.featured ? styles.planCardFeatured : ""}`} key={plan.code}>
        <span className={styles.planBadge}>{plan.eyebrow}</span><h3 className={styles.planName}>{plan.name}</h3><p className={styles.planBestFor}>{plan.bestFor}</p>
        <div className={styles.planMetrics}><div className={styles.planMetric}><span>Εφάπαξ ένταξη</span><strong>{plan.setup}</strong></div><div className={styles.planMetric}><span>Συνδρομή</span><strong>{plan.recurring}</strong></div><div className={styles.planMetric}><span>Προμήθεια πωλήσεων</span><strong>{plan.commission}</strong></div><div className={styles.planMetric}><span>Διάρκεια / κύκλος</span><strong>{plan.commitment}</strong></div></div>
        <p className={styles.planNote}>{plan.note}</p><a className={`button ${styles.planAction}`} href={`/join/apply?plan=${plan.code}`}>Επίλεξε {plan.name}</a>
      </article>)}</div>
      <div className={styles.compareStrip} aria-label="Τι περιλαμβάνουν τα προγράμματα"><div><strong>Marketplace παρουσία</strong><span>Merchant profile, προϊόντα και τοπική ανακάλυψη.</span></div><div><strong>Vendor workspace</strong><span>Catalog, stock, παραγγελίες, fulfilment και οικονομική εικόνα.</span></div><div><strong>Fair Vendor Exposure</strong><span>Η ίδια λογική δίκαιης συμμετοχής εφαρμόζεται σε όλα τα ενεργά πλάνα.</span></div><div><strong>Ελεγχόμενη ενεργοποίηση</strong><span>Verification, εμπορικοί όροι και activation gates πριν από οποιαδήποτε χρέωση/ενεργοποίηση.</span></div></div>
      <p className={styles.planFootnote}>Οι τιμές εμφανίζονται προ ΦΠΑ όπου εφαρμόζεται. Η επιλογή προγράμματος είναι δήλωση ενδιαφέροντος· δεν δημιουργεί αυτόματα χρέωση ή σύμβαση. Οι τελικοί όροι επιβεβαιώνονται πριν από την ενεργοποίηση.</p>
    </section>

    <section className="content-band" id="eligibility"><div className="shell content-split"><div><div className="eyebrow light">Ποιοι μπορούν να συμμετέχουν</div><h2>Τοπικά μη διατροφικά καταστήματα.</h2><p>Η πιλοτική αγορά εστιάζει σε ενεργές επιχειρήσεις της Σπάρτης και της καθορισμένης γύρω περιοχής. Η τελική συμμετοχή προϋποθέτει επαλήθευση επιχείρησης, τοποθεσίας, κατηγορίας, δικαιωμάτων περιεχομένου και συμφωνημένων εμπορικών όρων.</p></div><div className="content-fact-list"><div><strong>Χρειάζεται</strong><span>Νόμιμη επιχείρηση, πραγματικό σημείο ή επιλέξιμη περιοχή εξυπηρέτησης και υπεύθυνος λογαριασμού.</span></div><div><strong>Ελέγχεται</strong><span>Κατηγορία, στοιχεία KYB, δικαιώματα εικόνων, συμμόρφωση προϊόντων και δυνατότητα εκπλήρωσης.</span></div><div><strong>Δεν αρκεί</strong><span>Μία απλή δημόσια καταχώριση ή η αποστολή προϊόντων χωρίς ολοκλήρωση των activation gates.</span></div></div></div></section>
    <section className="shell section"><div className="section-heading"><div><div className="eyebrow">Πώς ξεκινάμε</div><h2>Onboarding με πραγματικούς ελέγχους</h2></div><p className="section-note">Η πρόσκληση και η αίτηση δεν ισοδυναμούν με δημόσια ενεργοποίηση. Κάθε στάδιο ολοκληρώνεται με καταγεγραμμένο έλεγχο.</p></div><div className="category-grid">{steps.map(([number,title,body]) => <article className="category-card" key={number}><span className="category-mark">{number}</span><span><strong>{title}</strong><small>{body}</small></span></article>)}</div></section>
    <section className="section section-tint"><div className="shell"><div className="section-heading"><div><div className="eyebrow">Τι αποκτά το κατάστημα</div><h2>Ένα πραγματικό λειτουργικό workspace.</h2></div><p className="section-note">Οι δυνατότητες ενεργοποιούνται σύμφωνα με τον ρόλο, το πλάνο και την ολοκλήρωση των απαιτούμενων ελέγχων.</p></div><div className="principle-grid">{benefits.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
    <section className="shell ask-local section"><div><div className="eyebrow">Founding Partner</div><h2>Περιορισμένη θέση στην πρώτη ομάδα συνεργατών.</h2><p>Το Founding Partner πρόγραμμα παραμένει διαθέσιμο έως τη συμπλήρωση των 50 συνεργατών: €1.500 εφάπαξ, χωρίς επαναλαμβανόμενη συνδρομή και με 2% προμήθεια πωλήσεων κατά την προστατευμένη περίοδο των 36 μηνών.</p><div className="hero-actions"><a className="button" href="/join/apply?plan=founding_2026">Υπόβαλε αίτηση Founding</a><a className="button button-secondary" href="/about">Η αποστολή της πλατφόρμας</a></div></div><div className="fairness-note"><strong>Είσαι ήδη εγκεκριμένος συνεργάτης;</strong><p>Συνδέσου στο προστατευμένο vendor workspace. Η δημόσια αίτηση οδηγεί μόνο σε verification και όχι σε shortcut ενεργοποίησης.</p><a className="text-link" href="/vendor/login">Είσοδος συνεργαζόμενου καταστήματος →</a></div></section>
    <SiteFooter />
  </main>;
}
import type { Metadata } from "next";
import Link from "next/link";
import { AccessibilityReportForm } from "../../components/AccessibilityReportForm";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { CONTROLLER, LEGAL_LAST_UPDATED } from "../../lib/legal-transparency";

export const metadata: Metadata = {
  title: "Δήλωση Προσβασιμότητας",
  description: "Ο στόχος WCAG 2.2 AA του ΚΟΝΤΑ ΜΟΥ, τρόποι χρήσης, γνωστές περιοχές υπό έλεγχο και τρόπος αναφοράς εμποδίου προσβασιμότητας.",
  alternates: { canonical: "/accessibility" }
};

const principles = [
  ["Αντιληπτό", "Επαρκής αντίθεση, κείμενο που μεγεθύνεται, εναλλακτικό κείμενο για ουσιαστικές εικόνες και πληροφορία που δεν βασίζεται μόνο στο χρώμα."],
  ["Λειτουργικό", "Πλήρης λειτουργία με πληκτρολόγιο, ορατό focus, επαρκείς στόχοι αφής, εναλλακτική στα QR/drag gestures και σεβασμός στο reduced motion."],
  ["Κατανοητό", "Σταθερή πλοήγηση, σαφείς ετικέτες, κατανοητά errors, διατήρηση έγκυρων πεδίων και επιβεβαίωση πριν από κρίσιμες ενέργειες."],
  ["Ανθεκτικό", "Σημασιολογικό HTML, ονόματα/ρόλοι/καταστάσεις για assistive technology και δυναμικές ενημερώσεις που ανακοινώνονται χωρίς να κλέβουν απρόβλεπτα το focus."]
] as const;

export default function AccessibilityPage() {
  return <main className="legal-page">
    <div className="announcement">Προσβασιμότητα ως βασικό χαρακτηριστικό της υπηρεσίας — όχι ως overlay.</div>
    <SiteHeader compact />
    <section className="content-hero content-hero-privacy"><div className="shell content-hero-grid"><div><div className="eyebrow light">Accessibility statement</div><h1>Στόχος: WCAG 2.2 επίπεδο AA</h1><p>Το ΚΟΝΤΑ ΜΟΥ σχεδιάζει τη δημόσια αγορά, τον λογαριασμό πελάτη και τα λειτουργικά workspaces με κοινό baseline προσβασιμότητας WCAG 2.2 AA.</p><div className="hero-actions"><a className="button button-light" href="#accessibility-report">Αναφορά προβλήματος</a><Link className="button content-outline" href="/help">Κέντρο βοήθειας</Link></div></div><div className="legal-stamp" aria-hidden="true"><span>WCAG</span><strong>2.2 AA</strong><i>ACCESS</i></div></div></section>

    <section className="shell legal-section"><div className="eyebrow">Δέσμευση</div><h2>Τι σημαίνει ο στόχος στην πράξη</h2><p>Χρησιμοποιούμε το WCAG 2.2 AA ως εσωτερικό engineering standard. Λαμβάνουμε επίσης υπόψη τις απαιτήσεις προσβασιμότητας που εφαρμόζονται στις υπηρεσίες ηλεκτρονικού εμπορίου στην Ευρωπαϊκή Ένωση και στην ελληνική νομοθεσία, όπου αυτές είναι εφαρμοστέες.</p><p>Δεν θεωρούμε ότι ένα automated score ή ένα accessibility overlay αποδεικνύει συμμόρφωση. Η αξιολόγηση συνδυάζει automated checks, πραγματικές browser ροές και χειροκίνητο έλεγχο.</p><div className="legal-card-grid">{principles.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></section>

    <section className="content-band"><div className="shell legal-section legal-section-on-dark"><div className="eyebrow light">Κρίσιμες ροές</div><h2>Η αγορά πρέπει να ολοκληρώνεται χωρίς ποντίκι ή κάμερα</h2><div className="legal-card-grid"><article><h3>Αγορά</h3><p>Πλοήγηση → αναζήτηση → προϊόν → καλάθι → checkout → πληρωμή → επιβεβαίωση πρέπει να παραμένουν λειτουργικά με πληκτρολόγιο και assistive technology.</p></article><article><h3>Παραλαβή</h3><p>Το QR δεν είναι μοναδικό μέσο. Παρέχεται αναγνώσιμος κωδικός/εναλλακτική διαδικασία ώστε αποτυχία κάμερας ή οπτική αναπηρία να μη μπλοκάρει την παραλαβή.</p></article><article><h3>Dashboards</h3><p>Vendor, Daily και Admin ακολουθούν το ίδιο baseline: επαρκές μέγεθος κειμένου/targets, focus, labels, status text και keyboard operation.</p></article><article><h3>Μηνύματα & έγγραφα</h3><p>Transactional emails και PDF/παραστατικά πρέπει να έχουν αναγνώσιμη δομή, λογική σειρά, σωστή γλώσσα, αντίθεση και προσβάσιμο κείμενο.</p></article></div></div></section>

    <section className="shell legal-section"><div className="eyebrow">Ρυθμίσεις χρήσης</div><h2>Προσαρμογές που παραμένουν στη συσκευή σου</h2><p>Το κουμπί <strong>«Προσβασιμότητα»</strong> είναι διαθέσιμο σε όλο το site. Μπορείς να αυξήσεις το μέγεθος, να ενισχύσεις την αντίθεση και το keyboard focus, να υπογραμμίσεις links, να αυξήσεις text spacing ή να μειώσεις την κίνηση. Οι επιλογές αποθηκεύονται τοπικά στη συσκευή σου και μπορούν να μηδενιστούν οποιαδήποτε στιγμή.</p><p>Αυτές οι προσαρμογές είναι βοηθήματα χρήσης και όχι accessibility overlay ή πιστοποιητικό συμμόρφωσης. Η υποχρέωση παραμένει η ίδια η υπηρεσία και οι βασικές ροές της να είναι προσβάσιμες.</p></section>

    <section className="shell legal-section"><div className="eyebrow">Τρόποι υποστήριξης</div><h2>Χαρακτηριστικά που σχεδιάζονται για προσβάσιμη χρήση</h2><ul className="legal-list"><li>Ορατό keyboard focus και skip/navigation landmarks.</li><li>Zoom/reflow χωρίς απώλεια λειτουργίας στις βασικές ροές.</li><li>Ελάχιστη αντίθεση σύμφωνα με τα εφαρμοστέα WCAG criteria.</li><li>Επαρκείς touch targets, με εσωτερικό στόχο περίπου 44×44 CSS px για σημαντικές ενέργειες όπου είναι πρακτικό.</li><li>Labels, autocomplete και programmatic errors στα forms.</li><li>Υποστήριξη password managers και paste στην authentication εμπειρία.</li><li>Σεβασμός στο <code>prefers-reduced-motion</code>.</li><li>Status labels/icons μαζί με χρώμα, όχι χρώμα ως μοναδικό σήμα.</li><li>Pause/keyboard controls για κινούμενο carousel περιεχόμενο.</li></ul></section>

    <section className="shell legal-section"><div className="eyebrow">Τρέχουσα κατάσταση</div><h2>Περιοχές που παραμένουν υπό συστηματική επαλήθευση</h2><p>Η προσβασιμότητα είναι συνεχής διαδικασία. Η πλήρης χειροκίνητη αξιολόγηση των authenticated dashboards, των PDF/παραστατικών, των camera/QR flows, των δυναμικών notifications και των provider-hosted τμημάτων checkout πρέπει να επαναλαμβάνεται σε κάθε σημαντική αλλαγή.</p><p>Ένα automated test δεν επαρκεί από μόνο του. Οι release checks πρέπει να συμπληρώνονται με keyboard-only testing, screen reader testing, zoom/reflow, mobile/touch και έλεγχο πραγματικών customer/vendor/admin workflows.</p></section>

    <section className="shell legal-section" id="accessibility-report"><div className="eyebrow">Αναφορά εμποδίου</div><h2>Αν κάτι δεν είναι προσβάσιμο, καταχώρισέ το συγκεκριμένα</h2><p>Η παρακάτω αναφορά δημιουργεί εσωτερικό accessibility record ώστε να μπορεί να ελεγχθεί, να γίνει remediation και να επαληθευτεί. Δεν συλλέγουμε IP ή device fingerprint μέσω αυτής της φόρμας και αποθηκεύουμε email μόνο αν ζητήσεις επικοινωνία.</p><AccessibilityReportForm /><p>Εναλλακτικά μπορείς να στείλεις email στο <a href={`mailto:${CONTROLLER.email}`}>{CONTROLLER.email}</a> ή να καλέσεις στο <a href={`tel:+30${CONTROLLER.phone}`}>{CONTROLLER.phone}</a>. Αν μια λειτουργία σε εμποδίζει να ολοκληρώσεις αγορά, παραλαβή ή άλλο βασικό βήμα, ζήτησε και εναλλακτικό προσβάσιμο τρόπο εξυπηρέτησης.</p><p className="legal-updated">Τελευταία ενημέρωση: {LEGAL_LAST_UPDATED}</p></section>

    <section className="shell content-cta"><div><div className="eyebrow">Σχετικές πληροφορίες</div><h2>Προσβασιμότητα και ιδιωτικότητα σχεδιάζονται μαζί.</h2></div><div className="hero-actions"><Link className="button" href="/privacy">Πολιτική Απορρήτου</Link><Link className="button button-secondary" href="/privacy-controls">Privacy controls</Link></div></section>
    <SiteFooter />
  </main>;
}

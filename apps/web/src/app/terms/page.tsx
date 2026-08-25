import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { CONTROLLER } from "../../lib/legal-transparency";

export const metadata: Metadata = {
  title: "Όροι Χρήσης",
  description: "Οι βασικοί όροι χρήσης του ΚΟΝΤΑ ΜΟΥ για λογαριασμούς, αγορές, Ask Local, πληρωμές, παραδόσεις και υποστήριξη."
};

const LAST_UPDATED = "25 Αυγούστου 2026";

export default function TermsPage() {
  return <main className="legal-page">
    <div className="announcement">Καθαροί κανόνες για λογαριασμό, αγορά και χρήση της τοπικής αγοράς.</div>
    <SiteHeader compact />

    <section className="content-hero content-hero-privacy">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Legal · Terms of use</div>
          <h1>Όροι Χρήσης</h1>
          <p>Οι όροι αυτοί εξηγούν τους βασικούς κανόνες για τη δημιουργία λογαριασμού, τη χρήση των υπηρεσιών του ΚΟΝΤΑ ΜΟΥ και τις συναλλαγές που πραγματοποιούνται μέσω της πλατφόρμας.</p>
          <div className="hero-actions"><Link className="button button-light" href="/privacy">Πολιτική Απορρήτου</Link><Link className="button content-outline" href="/returns-refunds">Επιστροφές & refunds</Link></div>
        </div>
        <div className="legal-stamp" aria-hidden="true"><span>TERMS</span><strong>OF USE</strong><i>KONTA MOU</i></div>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="scope">
      <div className="legal-prose">
        <div className="eyebrow">1 · Πεδίο εφαρμογής</div>
        <h2 id="scope">Τι καλύπτουν οι όροι</h2>
        <p>Οι παρόντες όροι διέπουν τη χρήση του kontamou.site, τη δημιουργία και χρήση λογαριασμού πελάτη, την αναζήτηση προϊόντων και καταστημάτων, το Ask Local, τις συμβουλές καταστημάτων, το καλάθι, το checkout, τις παραγγελίες, τις παραδόσεις, τις επιστροφές και τις λειτουργίες υποστήριξης.</p>
        <p>Με τη δημιουργία λογαριασμού δηλώνεις ότι έχεις διαβάσει και αποδέχεσαι τους παρόντες όρους. Αν δεν συμφωνείς, δεν πρέπει να ολοκληρώσεις την εγγραφή ή να χρησιμοποιήσεις λειτουργίες που απαιτούν λογαριασμό.</p>
        <p className="legal-updated">Τελευταία ενημέρωση: {LAST_UPDATED}</p>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="account">
      <div className="eyebrow">2 · Λογαριασμός</div>
      <h2 id="account">Ακριβή στοιχεία και ασφαλής πρόσβαση</h2>
      <p>Πρέπει να χρησιμοποιείς πραγματικό email, να παρέχεις ακριβή στοιχεία όπου ζητούνται και να προστατεύεις τον κωδικό πρόσβασής σου. Δεν επιτρέπεται να χρησιμοποιείς λογαριασμό άλλου προσώπου χωρίς εξουσιοδότηση ή να δημιουργείς λογαριασμό με σκοπό απάτη, κατάχρηση ή παραβίαση της νομοθεσίας.</p>
      <p>Μπορούμε να περιορίσουμε ή να αναστείλουμε πρόσβαση όταν αυτό είναι αναγκαίο για ασφάλεια, πρόληψη κατάχρησης, συμμόρφωση με τον νόμο ή προστασία πελατών και συνεργατών.</p>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark">
        <div className="eyebrow light">3 · Αγορά</div>
        <h2>Προϊόντα, τιμές και παραγγελίες</h2>
        <div className="legal-card-grid">
          <article><h3>Πληροφορίες προϊόντος</h3><p>Καταβάλλεται προσπάθεια οι τίτλοι, εικόνες, χαρακτηριστικά, διαθεσιμότητα και τιμές να είναι ακριβή. Σε περίπτωση προφανούς λάθους ή ασυμφωνίας, μπορεί να χρειαστεί διόρθωση πριν ολοκληρωθεί η παραγγελία.</p></article>
          <article><h3>Checkout</h3><p>Πριν από την τελική επιβεβαίωση εμφανίζονται τα προϊόντα, οι ποσότητες, οι βασικές χρεώσεις και οι διαθέσιμες επιλογές fulfilment. Η υποβολή παραγγελίας δεν καταργεί δικαιώματα καταναλωτή που προβλέπονται από αναγκαστικό δίκαιο.</p></article>
          <article><h3>Διαθεσιμότητα</h3><p>Η διαθεσιμότητα μπορεί να αλλάξει, ιδίως όταν το απόθεμα τηρείται από τοπικό κατάστημα. Αν ένα προϊόν δεν μπορεί να εκτελεστεί, θα εφαρμοστεί η κατάλληλη διαδικασία ενημέρωσης, αντικατάστασης, ακύρωσης ή επιστροφής χρημάτων ανά περίπτωση.</p></article>
        </div>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="payments">
      <div className="eyebrow">4 · Πληρωμές & fulfilment</div>
      <h2 id="payments">Πληρωμή, παραλαβή και παράδοση</h2>
      <p>Οι διαθέσιμοι τρόποι πληρωμής και παράδοσης εμφανίζονται κατά το checkout. Για συναλλαγές που διεκπεραιώνονται μέσω εξωτερικού παρόχου πληρωμών, μπορεί να εφαρμόζονται και οι τεχνικοί ή συμβατικοί κανόνες του παρόχου, χωρίς να περιορίζονται τα νόμιμα δικαιώματά σου.</p>
      <p>Για τοπική παραλαβή ή παράδοση μπορεί να απαιτείται κωδικός, QR ή άλλη ασφαλής επιβεβαίωση. Μην κοινοποιείς τέτοιο κωδικό πριν παραλάβεις πράγματι την παραγγελία σου.</p>
      <p><Link className="text-link" href="/delivery-pickup">Περισσότερα για παράδοση & παραλαβή →</Link></p>
    </section>

    <section className="shell legal-section" aria-labelledby="returns">
      <div className="eyebrow">5 · Ακυρώσεις, επιστροφές & refunds</div>
      <h2 id="returns">Τα δικαιώματα καταναλωτή παραμένουν σε ισχύ</h2>
      <p>Οι ακυρώσεις, υπαναχωρήσεις, επιστροφές, επισκευές, αντικαταστάσεις και refunds εξετάζονται σύμφωνα με την εφαρμοστέα νομοθεσία, τη φύση του προϊόντος και το στάδιο εκτέλεσης της παραγγελίας. Κανένας όρος της πλατφόρμας δεν έχει σκοπό να αποκλείσει δικαίωμα που δεν επιτρέπεται νομίμως να αποκλειστεί.</p>
      <p><Link className="text-link" href="/returns-refunds">Δες την αναλυτική σελίδα επιστροφών & refunds →</Link></p>
    </section>

    <section className="shell legal-section" aria-labelledby="services">
      <div className="eyebrow">6 · Ask Local & συμβουλές</div>
      <h2 id="services">Αιτήματα, προσφορές και ανθρώπινη καθοδήγηση</h2>
      <p>Το Ask Local και οι λειτουργίες συμβουλής διευκολύνουν την επικοινωνία με κατάλληλα τοπικά καταστήματα. Οι πληροφορίες που παρέχονται πρέπει να αξιολογούνται μαζί με τα πραγματικά χαρακτηριστικά του προϊόντος, τις οδηγίες του κατασκευαστή και, όπου χρειάζεται, εξειδικευμένη επαγγελματική συμβουλή.</p>
      <p>Δεν επιτρέπεται η χρήση των λειτουργιών αυτών για παράνομο περιεχόμενο, παρενόχληση, spam, εξαπάτηση ή απόπειρα παράκαμψης των μηχανισμών ασφάλειας της πλατφόρμας.</p>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark">
        <div className="eyebrow light">7 · Διαθεσιμότητα υπηρεσίας</div>
        <h2>Συντήρηση, αλλαγές και τεχνικά συμβάντα</h2>
        <p>Μπορεί να απαιτηθούν ενημερώσεις, προσωρινές διακοπές ή αλλαγές λειτουργιών για λόγους ασφάλειας, συντήρησης, κανονιστικής συμμόρφωσης ή βελτίωσης της υπηρεσίας. Καταβάλλεται προσπάθεια οι κρίσιμες ροές παραγγελιών και πληρωμών να προστατεύονται και να αποκαθίστανται με προτεραιότητα.</p>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="privacy">
      <div className="eyebrow">8 · Προσωπικά δεδομένα</div>
      <h2 id="privacy">Η ιδιωτικότητα καλύπτεται ξεχωριστά</h2>
      <p>Η συλλογή και χρήση προσωπικών δεδομένων περιγράφεται στην Πολιτική Απορρήτου. Οι επιλογές cookies και προαιρετικής προσωποποίησης ή analytics διαχειρίζονται ξεχωριστά από την αποδοχή αυτών των όρων.</p>
      <p><Link className="text-link" href="/privacy">Διάβασε την Πολιτική Απορρήτου →</Link></p>
    </section>

    <section className="shell legal-section" aria-labelledby="changes">
      <div className="eyebrow">9 · Αλλαγές & επικοινωνία</div>
      <h2 id="changes">Πώς ενημερώνονται οι όροι</h2>
      <p>Οι όροι μπορεί να ενημερώνονται όταν αλλάζουν λειτουργίες, επιχειρησιακές διαδικασίες ή νομικές απαιτήσεις. Η ημερομηνία τελευταίας ενημέρωσης εμφανίζεται στην παρούσα σελίδα. Για ουσιώδεις αλλαγές που απαιτούν νέα αποδοχή, η πλατφόρμα μπορεί να ζητήσει εκ νέου ρητή επιβεβαίωση.</p>
      <p>Για ερωτήσεις σχετικά με τους όρους μπορείς να επικοινωνήσεις στο <a href={`mailto:${CONTROLLER.email}`}>{CONTROLLER.email}</a>.</p>
    </section>

    <SiteFooter />
  </main>;
}

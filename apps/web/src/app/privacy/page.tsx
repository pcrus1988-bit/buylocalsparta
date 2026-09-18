import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { CONTROLLER, DATA_ACCESS_EXAMPLES, DATA_RECIPIENTS } from "../../lib/legal-transparency";

const PRIVACY_LAST_UPDATED = "18 Σεπτεμβρίου 2026";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/privacy", {
    title: "Πολιτική Απορρήτου",
    description: "Με απλά λόγια: ποια δεδομένα χρησιμοποιεί το ΚΟΝΤΑ ΜΟΥ, γιατί τα χρειάζεται, ποιος μπορεί να τα δει, πόσο διατηρούνται και πώς ασκείς τα δικαιώματά σου."
  });
}

const processing = [
  ["Λογαριασμός & σύνδεση", "Email, προφίλ, στοιχεία σύνδεσης, sessions και security events", "Εκτέλεση σύμβασης / ασφάλεια υπηρεσίας"],
  ["Αίτηση καταστήματος & ΓΕΜΗ", "ΑΦΜ, ΓΕΜΗ, επωνυμία, έδρα, δημόσια εταιρικά στοιχεία και όσα συμπληρώνει ο αιτών", "Προσυμβατικά μέτρα και, όπου χρειάζεται, έννομο συμφέρον"],
  ["Καλάθι, checkout & παραγγελία", "Προϊόντα, ποσά, ιστορικό, στοιχεία παραλήπτη, διευθύνσεις, locker και fulfilment επιλογές", "Εκτέλεση σύμβασης"],
  ["Πληρωμές & refunds", "Ποσό, αναφορά παραγγελίας, στοιχεία χρέωσης/αποστολής και payment identifiers", "Εκτέλεση σύμβασης / νομική υποχρέωση"],
  ["Gift Cards", "Κωδικός σε hashed μορφή, υπόλοιπο, holder account, συναλλαγές εξαργύρωσης και σχετική παραγγελία", "Εκτέλεση σύμβασης / πρόληψη κατάχρησης"],
  ["Ask Local & ιδιωτικές προσφορές", "Περιγραφή ανάγκης, transcript φωνής, φωτογραφία αναφοράς, barcode, διευκρινίσεις, προσφορές και σχετικό προϊόν/κατάστημα", "Εκτέλεση υπηρεσίας που ζήτησε ο χρήστης"],
  ["Υποστήριξη, returns & recalls", "Ticket, μηνύματα, σχετική παραγγελία/επιστροφή, φωτογραφίες ή αποδεικτικά όπου χρειάζονται", "Εκτέλεση σύμβασης, έννομο συμφέρον ή νομική υποχρέωση"],
  ["Παράδοση, pickup & επιστροφές", "Όνομα, τηλέφωνο, διεύθυνση/locker, fulfilment status, QR/proof references και tracking", "Εκτέλεση σύμβασης"],
  ["Live τοπική παράδοση", "Θέση του ανατεθειμένου οδηγού κατά την ενεργή εργασία, ακρίβεια και χρονική σήμανση", "Εκτέλεση υπηρεσίας / λειτουργική ασφάλεια"],
  ["Supplier-fulfilled / dropshipping", "Γραμμές παραγγελίας και τα απολύτως αναγκαία στοιχεία αποστολής όταν ο συνεργαζόμενος προμηθευτής εκτελεί την αποστολή", "Εκτέλεση σύμβασης"],
  ["Flash Sale & επιλεξιμότητα", "Account ID, ημερήσια συμμετοχή, επιλογές/swipes, entitlement και έλεγχοι διαθεσιμότητας", "Παροχή της υπηρεσίας / πρόληψη κατάχρησης"],
  ["Saved, recent & προτιμήσεις", "Αποθηκευμένα προϊόντα, πρόσφατες προβολές και ρυθμίσεις προσωποποίησης", "Λειτουργία λογαριασμού και συγκατάθεση όπου απαιτείται"],
  ["AADE / φορολογικά", "Στοιχεία συναλλαγής και όσα φορολογικά δεδομένα απαιτούνται", "Νομική υποχρέωση"],
  ["Ασφάλεια & πρόληψη κατάχρησης", "Ψευδωνυμικά IDs, rate-limit signals, audit trail και security events", "Έννομο συμφέρον"],
  ["Analytics", "Ψευδωνυμικά page-view, engagement και product/conversion events", "Συγκατάθεση"],
  ["Marketing", "Μόνο δεδομένα ή trackers που αντιστοιχούν σε ρητή επιλογή marketing", "Συγκατάθεση"]
] as const;

const plainLanguage = [
  ["Δεν πουλάμε τα δεδομένα σου", "Τα προσωπικά δεδομένα χρησιμοποιούνται για να λειτουργήσει το marketplace, να εκτελεστεί η συναλλαγή, να προστατευτεί η υπηρεσία και για προαιρετικές λειτουργίες που ελέγχεις."],
  ["Τα καταστήματα δεν παίρνουν customer list", "Ένας συνεργάτης βλέπει μόνο ό,τι χρειάζεται για τη συγκεκριμένη παραγγελία, Ask Local απάντηση, pickup ή άλλη εξουσιοδοτημένη εργασία."],
  ["Το Ask Local παραμένει ιδιωτικό", "Η περιγραφή, η φωτογραφία, το barcode και οι ιδιωτικές προσφορές δεν γίνονται δημόσιο feed. Προβάλλονται μόνο στους ρόλους που χρειάζονται για το συγκεκριμένο αίτημα."],
  ["Τα analytics είναι προαιρετικά", "Google Analytics και το προαιρετικό first-party analytics ενεργοποιούνται μόνο αφού επιλέξεις Analytics στο consent layer."]
] as const;

export default function PrivacyPage() {
  const tel = `tel:+30${CONTROLLER.phone}`;

  return <main className="legal-page">
    <div className="announcement">Απόρρητο με απλά λόγια · μόνο ό,τι χρειάζεται, μόνο για όσο χρειάζεται.</div>
    <SiteHeader compact />

    <section className="content-hero content-hero-privacy">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">GDPR · Privacy notice</div>
          <h1>Πολιτική Απορρήτου</h1>
          <p>Θέλουμε να ξέρεις τι συμβαίνει με τα δεδομένα σου χωρίς να χρειάζεται να είσαι νομικός. Εδώ εξηγούμε τι συλλέγουμε, γιατί το χρειαζόμαστε, ποιος μπορεί να το δει και τι μπορείς να ελέγξεις.</p>
          <div className="hero-actions">
            <Link className="button button-light" href="/privacy-controls">Τα privacy controls μου</Link>
            <Link className="button content-outline" href="/cookies">Cookies</Link>
          </div>
        </div>
        <div className="legal-stamp" aria-hidden="true"><span>PRIVACY</span><strong>BY DESIGN</strong><i>GDPR</i></div>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="plain-language">
      <div className="eyebrow">Σε απλά ελληνικά</div>
      <h2 id="plain-language">Τέσσερα πράγματα που αξίζει να ξέρεις πρώτα.</h2>
      <div className="legal-card-grid">
        {plainLanguage.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="controller">
      <div className="legal-prose">
        <div className="eyebrow">Υπεύθυνος επεξεργασίας</div>
        <h2 id="controller">Ποιος είναι υπεύθυνος για τα δεδομένα.</h2>
        <p>Υπεύθυνος επεξεργασίας για το ΚΟΝΤΑ ΜΟΥ είναι η <strong>{CONTROLLER.legalName}</strong>.</p>
        <dl className="legal-contact">
          <div><dt>Έδρα</dt><dd>{CONTROLLER.address}</dd></div>
          <div><dt>ΑΦΜ</dt><dd>{CONTROLLER.taxNumber}</dd></div>
          <div><dt>ΓΕΜΗ</dt><dd>{CONTROLLER.gemiNumber}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${CONTROLLER.email}`}>{CONTROLLER.email}</a></dd></div>
          <div><dt>Τηλέφωνο</dt><dd><a href={tel}>{CONTROLLER.phone}</a></dd></div>
        </dl>
        <p className="legal-updated">Τελευταία ενημέρωση: {PRIVACY_LAST_UPDATED}</p>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="processing">
      <div className="eyebrow">Τι χρησιμοποιούμε & γιατί</div>
      <h2 id="processing">Κάθε κατηγορία δεδομένων πρέπει να έχει συγκεκριμένο σκοπό.</h2>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead><tr><th>Δραστηριότητα</th><th>Τυπικά δεδομένα</th><th>Γιατί επιτρέπεται</th></tr></thead>
          <tbody>{processing.map(([activity, data, basis]) => <tr key={activity}><th scope="row">{activity}</th><td>{data}</td><td>{basis}</td></tr>)}</tbody>
        </table>
      </div>
      <p>Δεν ζητάμε «συγκατάθεση» για κάτι που είναι αναγκαίο για να εκτελέσουμε την παραγγελία σου, να ανοίξουμε λογαριασμό, να χειριστούμε επιστροφή ή να τηρήσουμε φορολογική υποχρέωση. Η συγκατάθεση χρησιμοποιείται για πραγματικά προαιρετικούς σκοπούς, όπως analytics ή marketing, και μπορεί να ανακληθεί.</p>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark" aria-labelledby="ask-local-data">
        <div className="eyebrow light">Ask Local · ιδιωτικό by design</div>
        <h2 id="ask-local-data">Όταν μας δείχνεις τι ψάχνεις, δεν το κάνουμε δημόσιο.</h2>
        <div className="legal-card-grid">
          <article><h3>Κείμενο & διευκρινίσεις</h3><p>Η ανάγκη που περιγράφεις και οι απαντήσεις αποθηκεύονται μέσα στο ιδιωτικό αίτημα ώστε να μπορεί να συνεχιστεί η συζήτηση και να δημιουργηθεί προσφορά.</p></article>
          <article><h3>Φωτογραφία & barcode</h3><p>Η φωτογραφία αναφοράς συμπιέζεται πριν αποσταλεί και χρησιμοποιείται για το συγκεκριμένο Ask Local αίτημα. Όπου ο browser υποστηρίζει barcode detection, ο κωδικός μπορεί να αναγνωριστεί πριν την αποστολή.</p></article>
          <article><h3>Φωνητική εισαγωγή</h3><p>Η λειτουργία χρησιμοποιεί τη δυνατότητα speech recognition του browser και στο ΚΟΝΤΑ ΜΟΥ αποστέλλεται το κείμενο που προκύπτει, όχι ηχητικό αρχείο που καταγράφεται από την εφαρμογή. Ο browser ή ο πάροχός του μπορεί να επεξεργάζεται τον ήχο σύμφωνα με τη δική του υπηρεσία.</p></article>
          <article><h3>Ποιος το βλέπει</h3><p>Το αίτημα εμφανίζεται μόνο στον πελάτη, στους εξουσιοδοτημένους χειριστές και, όταν δρομολογηθεί, στο κατάλληλο κατάστημα που πρέπει να το αξιολογήσει.</p></article>
        </div>
      </div>
    </section>

    <section className="shell legal-section" id="gemi" aria-labelledby="gemi-title">
      <div className="eyebrow">Δημόσια εταιρικά δεδομένα</div>
      <h2 id="gemi-title">Πώς χρησιμοποιούμε τα Ανοιχτά Δεδομένα ΓΕΜΗ.</h2>
      <p>Στο universal Vendor Gateway και στις αιτήσεις συνεργάτη, όταν εισάγεται ΑΦΜ, το ΚΟΝΤΑ ΜΟΥ μπορεί να αναζητήσει την επιχείρηση στα δημόσια Ανοιχτά Δεδομένα του Γενικού Εμπορικού Μητρώου. Τα στοιχεία χρησιμοποιούνται για επαλήθευση εταιρικής ταυτότητας και για αντιστοίχιση της επιχείρησης στη σωστή αγορά/HUB πριν εμφανιστεί η αντίστοιχη διαδικασία συνεργασίας.</p>
      <div className="legal-card-grid">
        <article><h3>Πηγή</h3><p>Κεντρική Υπηρεσία ΓΕΜΗ / Κεντρική Ένωση Επιμελητηρίων Ελλάδος — <a href="https://opendata.businessportal.gr/" target="_blank" rel="noreferrer">Ανοιχτά Δεδομένα ΓΕΜΗ</a>.</p></article>
        <article><h3>Τι μπορεί να ανακτηθεί</h3><p>Onboarding-relevant δημοσιευμένα πεδία, όπως ΑΦΜ, αριθμός ΓΕΜΗ, επωνυμία, διακριτικός τίτλος, κατάσταση/νομικός τύπος, έδρα και, όταν υπάρχουν, δημόσια στοιχεία επικοινωνίας.</p></article>
        <article><h3>Τι δεν σημαίνει</h3><p>Η εύρεση μιας επιχείρησης στο ΓΕΜΗ δεν αποδεικνύει από μόνη της ότι ο αιτών είναι εξουσιοδοτημένος εκπρόσωπος και δεν μετατρέπει ένα δημόσιο email σε συγκατάθεση marketing.</p></article>
        <article><h3>Ελαχιστοποίηση</h3><p>Κρατάμε μόνο όσα στοιχεία χρειάζονται για verification, onboarding, routing στο σωστό HUB και σχετικό audit/provenance — όχι ολόκληρο το μητρώο χωρίς σκοπό.</p></article>
      </div>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark">
        <div className="eyebrow light">Πρόσβαση με σκοπό</div>
        <h2>Ποιος βλέπει τι — και γιατί.</h2>
        <div className="legal-card-grid">{DATA_ACCESS_EXAMPLES.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
        <p>Δεν δίνουμε σε κατάστημα, οδηγό ή supplier γενική πρόσβαση στον λογαριασμό σου. Η πρόσβαση περιορίζεται στη συγκεκριμένη παραγγελία, παράδοση, Ask Local αίτημα ή άλλη εξουσιοδοτημένη εργασία.</p>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="location">
      <div className="eyebrow">Τοποθεσία & live delivery</div>
      <h2 id="location">Δεν παρακολουθούμε συνεχώς την τοποθεσία του πελάτη.</h2>
      <p>Για την παράδοση χρησιμοποιούμε τη διεύθυνση ή το locker που έχεις επιλέξει. Στην τοπική παράδοση, όταν ενεργοποιείται live tracking, η εφαρμογή μπορεί να λαμβάνει την τοποθεσία του <strong>ανατεθειμένου οδηγού</strong> μόνο όσο η συγκεκριμένη εργασία βρίσκεται σε εξέλιξη και το live tracking είναι ενεργό.</p>
      <p>Η ακριβής διεύθυνση πελάτη δεν εμφανίζεται σε διαθέσιμες/μη ανατεθειμένες εργασίες οδηγών. Γίνεται διαθέσιμη στον οδηγό όταν έχει αναλάβει τη σχετική εργασία και τη χρειάζεται για να την εκτελέσει. Τα location pings οδηγού έχουν τεχνική ημερομηνία λήξης 30 ημερών.</p>
    </section>

    <section className="shell legal-section" aria-labelledby="automation">
      <div className="eyebrow">Αυτοματισμοί</div>
      <h2 id="automation">Χρησιμοποιούμε αυτοματοποίηση για routing και λειτουργία — όχι για να κρύψουμε αποφάσεις.</h2>
      <p>Το ΚΟΝΤΑ ΜΟΥ χρησιμοποιεί κανόνες και αλγορίθμους για πράγματα όπως fair vendor assignment, κατάταξη/αναζήτηση, stock checks, Flash Sale επιλογές, eligibility, routing Ask Local και ανίχνευση κατάχρησης. Αυτές οι λειτουργίες βοηθούν να λειτουργεί η υπηρεσία και δεν χρησιμοποιούνται σήμερα από το ΚΟΝΤΑ ΜΟΥ για αποκλειστικά αυτοματοποιημένες αποφάσεις που παράγουν νομικά ή παρόμοια σημαντικά αποτελέσματα για τον πελάτη.</p>
      <p>Αν επιλέξεις εξωτερική μέθοδο πληρωμής όπως Klarna, ο αντίστοιχος πάροχος μπορεί να πραγματοποιεί δικούς του ελέγχους επιλεξιμότητας ή κινδύνου σύμφωνα με τη δική του πολιτική απορρήτου και τους δικούς του όρους.</p>
    </section>

    <section className="shell legal-section" aria-labelledby="recipients">
      <div className="eyebrow">Αποδέκτες & πάροχοι</div>
      <h2 id="recipients">Πότε χρειάζεται να μοιραστούμε δεδομένα.</h2>
      <p>Διαβιβάζουμε μόνο ό,τι είναι αναγκαίο για τον συγκεκριμένο σκοπό. Οι βασικές κατηγορίες και πάροχοι σήμερα είναι:</p>
      <div className="legal-card-grid">{DATA_RECIPIENTS.map((item) => <article key={item.name}><h3>{item.name}</h3><p><strong>Σκοπός:</strong> {item.purpose}</p><p><strong>Δεδομένα:</strong> {item.data}</p></article>)}</div>
      <p>Ο νομικός ρόλος κάθε αποδέκτη μπορεί να διαφέρει ανά υπηρεσία — ορισμένοι ενεργούν ως εκτελούντες την επεξεργασία, άλλοι ως ανεξάρτητοι υπεύθυνοι για τη δική τους υπηρεσία. Όταν προσωπικά δεδομένα διαβιβάζονται εκτός ΕΟΧ, χρησιμοποιείται ο κατάλληλος μηχανισμός που προβλέπει ο GDPR, όπως απόφαση επάρκειας ή κατάλληλες συμβατικές εγγυήσεις.</p>
    </section>

    <section className="shell legal-section" aria-labelledby="retention">
      <div className="eyebrow">Διατήρηση</div>
      <h2 id="retention">Δεν κρατάμε όλα τα δεδομένα για τον ίδιο χρόνο.</h2>
      <p>Η διάρκεια εξαρτάται από τον σκοπό. Sessions, προσωρινά tokens, analytics identifiers, live location pings, support tickets, Ask Local requests, Gift Card ledger, order history και φορολογικά στοιχεία έχουν διαφορετικούς κύκλους ζωής.</p>
      <div className="legal-card-grid">
        <article><h3>Σύντομη λειτουργική διάρκεια</h3><p>Sessions και τεχνικά tokens λήγουν σύμφωνα με τη λειτουργία τους. Τα live driver location pings έχουν τεχνική λήξη 30 ημερών.</p></article>
        <article><h3>Όσο χρειάζεται η υπόθεση</h3><p>Ask Local, support, returns και σχετικά αποδεικτικά κρατούνται όσο χρειάζεται για την εξυπηρέτηση, την ασφάλεια, τη διαχείριση διαφοράς και τις εφαρμοστέες υποχρεώσεις.</p></article>
        <article><h3>Συναλλαγές & φορολογικά</h3><p>Παραγγελίες, πληρωμές, refunds, Gift Card ledger και παραστατικά μπορεί να χρειάζεται να διατηρηθούν περισσότερο για λογιστικές, φορολογικές ή νομικές υποχρεώσεις.</p></article>
        <article><h3>Όταν ο σκοπός τελειώνει</h3><p>Όπου δεν υπάρχει άλλος νόμιμος λόγος διατήρησης, τα δεδομένα διαγράφονται, ανωνυμοποιούνται ή παύουν να είναι διαθέσιμα στην ενεργή λειτουργία.</p></article>
      </div>
      <p>Γι’ αυτό η διαγραφή λογαριασμού δεν σημαίνει ότι μπορούμε να διαγράψουμε φορολογικό παραστατικό ή άλλο αρχείο που ο νόμος απαιτεί να διατηρηθεί.</p>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark" aria-labelledby="rights">
        <div className="eyebrow light">Τα δικαιώματά σου</div>
        <h2 id="rights">Δεν χρειάζεται να στείλεις «νομικό» email για να ζητήσεις τα δεδομένα σου.</h2>
        <p>Ανάλογα με την περίπτωση μπορείς να ζητήσεις πρόσβαση, διόρθωση, διαγραφή, περιορισμό ή φορητότητα, να εναντιωθείς σε επεξεργασία που βασίζεται σε έννομο συμφέρον και να ανακαλέσεις συγκατάθεση χωρίς να επηρεάζεται η νομιμότητα όσων έγιναν πριν την ανάκληση.</p>
        <p>Μπορείς να ξεκινήσεις από τα <Link className="text-link light-link" href="/privacy-controls">Privacy controls</Link>, από την ενότητα ιδιωτικότητας του λογαριασμού σου ή στο <a href={`mailto:${CONTROLLER.email}`}>{CONTROLLER.email}</a>. Για να προστατεύσουμε τα δεδομένα σου μπορεί να χρειαστούμε εύλογη επιβεβαίωση ταυτότητας.</p>
        <p>Αν θεωρείς ότι δεν αντιμετωπίστηκε σωστά ένα αίτημά σου, έχεις δικαίωμα καταγγελίας στην <a href="https://www.dpa.gr/" target="_blank" rel="noreferrer">Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα</a>.</p>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="security">
      <div className="eyebrow">Ασφάλεια & λογοδοσία</div>
      <h2 id="security">Περιορίζουμε την πρόσβαση αντί να βασιζόμαστε μόνο σε υποσχέσεις.</h2>
      <p>Η πλατφόρμα χρησιμοποιεί role-based permissions, vendor isolation/scoping, Row Level Security, session και CSRF controls, audit events, purpose-specific views και περιορισμούς ώστε κάθε ρόλος να βλέπει μόνο ό,τι χρειάζεται. Προνομιακές ενέργειες και ευαίσθητες λειτουργίες καταγράφονται ώστε να υπάρχει ίχνος ελέγχου.</p>
      <p>Κανένα σύστημα δεν μπορεί να εγγυηθεί απόλυτη ασφάλεια. Αν υπάρξει περιστατικό που απαιτεί γνωστοποίηση σε αρμόδια αρχή ή επηρεαζόμενα πρόσωπα, ακολουθείται η εφαρμοστέα διαδικασία του GDPR.</p>
    </section>

    <section className="shell legal-section" aria-labelledby="changes">
      <div className="eyebrow">Αλλαγές στην πολιτική</div>
      <h2 id="changes">Όταν αλλάζει ουσιωδώς η υπηρεσία, ενημερώνουμε και την εξήγηση.</h2>
      <p>Η πολιτική ενημερώνεται όταν προστίθενται νέες λειτουργίες, νέοι αποδέκτες, νέες κατηγορίες δεδομένων ή αλλάζουν οι τρόποι επεξεργασίας. Η ημερομηνία στην κορυφή δείχνει την τρέχουσα έκδοση. Αν μια αλλαγή απαιτεί νέα συγκατάθεση, δεν θεωρούμε ότι την έδωσες επειδή απλώς συνέχισες να χρησιμοποιείς το site.</p>
    </section>

    <section className="shell content-cta">
      <div>
        <div className="eyebrow">Θέλεις πρακτικό έλεγχο;</div>
        <h2>Η πολιτική απορρήτου συνδέεται με πραγματικές ρυθμίσεις.</h2>
        <p>Άλλαξε cookies, δες τις ρυθμίσεις λογαριασμού ή υπέβαλε αίτημα πρόσβασης, διαγραφής, διόρθωσης, περιορισμού ή εναντίωσης.</p>
      </div>
      <div className="hero-actions">
        <Link className="button" href="/privacy-controls">Privacy controls</Link>
        <Link className="button button-secondary" href="/account/privacy">Τα αιτήματά μου</Link>
      </div>
    </section>

    <SiteFooter />
  </main>;
}

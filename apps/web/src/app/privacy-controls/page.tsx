import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsButton } from "../../components/CookieSettingsButton";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { DATA_ACCESS_EXAMPLES } from "../../lib/legal-transparency";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/privacy-controls", {
    title: "Privacy controls & δικαιώματα δεδομένων",
    description: "Έλεγξε cookies και προσωποποίηση, υπέβαλε GDPR αίτημα και παρακολούθησε την πορεία του μέσα από τον λογαριασμό σου."
  });
}

const rights = [
  ["Πρόσβαση", "Δες ποια βασικά δεδομένα έχουμε για τον λογαριασμό σου και ζήτησε αναφορά."],
  ["Εξαγωγή", "Ζήτησε φορητή εξαγωγή. Όταν ετοιμαστεί, PDF και JSON εμφανίζονται μέσα στον λογαριασμό σου."],
  ["Διόρθωση", "Δώσε τα σωστά στοιχεία για όνομα, επώνυμο, τηλέφωνο ή γλώσσα. Για αλλαγή email χρησιμοποιείται η ασφαλής verified-email διαδικασία."],
  ["Διαγραφή", "Ζήτησε διαγραφή των δεδομένων που δεν χρειάζεται να διατηρούνται για νόμιμο ή συμβατικό σκοπό."],
  ["Περιορισμός", "Ζήτησε να περιοριστεί η επεξεργασία όσο εξετάζεται το σχετικό δικαίωμα."],
  ["Εναντίωση", "Εξήγησε σε ποια προαιρετική ή legitimate-interest επεξεργασία εναντιώνεσαι."],
  ["Marketing", "Ανάκλησε marketing σε επίπεδο λογαριασμού. Τα cookies/analytics ελέγχονται ξεχωριστά."],
  ["Κλείσιμο λογαριασμού", "Ζήτησε κλείσιμο και ανωνυμοποίηση μη απαραίτητων στοιχείων, με διατήρηση μόνο όσων πρέπει νόμιμα να παραμείνουν."]
] as const;

export default function PrivacyControlsPage() {
  return <main className="legal-page">
    <div className="announcement">Privacy controls που κάνουν πραγματικά κάτι · όχι απλώς μια σελίδα ενημέρωσης.</div>
    <SiteHeader compact />

    <section className="content-hero content-hero-privacy">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Privacy & data centre</div>
          <h1>Τα δεδομένα σου, με πρακτικό έλεγχο.</h1>
          <p>Άλλαξε cookies και προσωποποίηση άμεσα ή υπέβαλε επίσημο GDPR αίτημα από τον λογαριασμό σου. Κάθε αίτημα μπαίνει σε πραγματικό workflow, με Admin χειρισμό, ορατή κατάσταση και τελική απάντηση.</p>
          <div className="hero-actions">
            <Link className="button button-light" href="/account/privacy">Ιδιωτικότητα & δεδομένα</Link>
            <CookieSettingsButton className="button content-outline" label="Ρυθμίσεις cookies" />
          </div>
        </div>
        <div className="privacy-dial" aria-hidden="true"><span>YOU</span><i>CONTROL</i><strong>DATA</strong></div>
      </div>
    </section>

    <section className="shell legal-section">
      <div className="eyebrow">Τι μπορείς να αλλάξεις αμέσως</div>
      <h2>Κάποιες επιλογές δεν χρειάζονται καν αίτημα.</h2>
      <div className="legal-card-grid">
        <article><h3>Cookies & Analytics</h3><p>Analytics είναι προαιρετικά και μπορούν να ενεργοποιηθούν ή να ανακληθούν οποιαδήποτε στιγμή. Η αλλαγή εφαρμόζεται τεχνικά, όχι μόνο στο UI.</p><CookieSettingsButton /></article>
        <article><h3>Προσωποποιημένες προτάσεις</h3><p>Μέσα στον λογαριασμό μπορείς να κλείσεις recommendations χωρίς να περιμένεις υποστήριξη.</p><Link className="text-link" href="/account/privacy">Account privacy →</Link></article>
        <article><h3>Πρόσφατα προβεβλημένα</h3><p>Η απενεργοποίηση σταματά τη νέα καταγραφή για αυτή τη λειτουργία και καθαρίζει το σχετικό ιστορικό όπου επιτρέπεται άμεσα.</p><Link className="text-link" href="/account/privacy">Account privacy →</Link></article>
        <article><h3>Ασφαλής αλλαγή email</h3><p>Η αλλαγή email δεν γίνεται μέσω απλού GDPR note. Χρησιμοποιεί ξεχωριστή διαδικασία επαλήθευσης ώστε να μην μπορεί κάποιος τρίτος να αλλάξει τη διεύθυνση λογαριασμού.</p><Link className="text-link" href="/account/security">Account security →</Link></article>
      </div>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark">
        <div className="eyebrow light">Τι γίνεται όταν υποβάλεις GDPR αίτημα</div>
        <h2>Από το αίτημα στην απάντηση, με ανθρώπινο έλεγχο.</h2>
        <div className="legal-card-grid">
          <article><h3>1 · Καταχώρηση</h3><p>Το αίτημα αποθηκεύεται με τύπο, ημερομηνία και στόχο επεξεργασίας και εμφανίζεται στο ιστορικό του λογαριασμού σου.</p></article>
          <article><h3>2 · Linked support case</h3><p>Δημιουργείται αυτόματα αντίστοιχο privacy case στην Admin Support Queue ώστε να μη μείνει ένα αίτημα «κρυμμένο» μόνο σε νομικό registry.</p></article>
          <article><h3>3 · Ενέργεια & report</h3><p>Ανάλογα με το αίτημα, ο Admin μπορεί να δημιουργήσει report, να εφαρμόσει correction, διαγραφή μη απαραίτητων δεδομένων, περιορισμό, ανάκληση marketing ή προετοιμασία κλεισίματος.</p></article>
          <article><h3>4 · Ανθρώπινη επιβεβαίωση</h3><p>Η τελική απάντηση email δεν φεύγει αυτόματα. Admin ελέγχει το αποτέλεσμα και επιβεβαιώνει χειροκίνητα την αποστολή και ολοκλήρωση.</p></article>
        </div>
      </div>
    </section>

    <section className="shell legal-section">
      <div className="eyebrow">GDPR αιτήματα</div>
      <h2>Διάλεξε ακριβώς τι χρειάζεσαι.</h2>
      <div className="legal-card-grid">{rights.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
      <div className="hero-actions"><Link className="button" href="/account/privacy">Υποβολή αιτήματος</Link><Link className="button button-secondary" href="/privacy">Πολιτική Απορρήτου</Link></div>
    </section>

    <section className="shell legal-section">
      <div className="eyebrow">Access & export</div>
      <h2>Όταν το report είναι έτοιμο, το παίρνεις από τον δικό σου λογαριασμό.</h2>
      <p>Για αιτήματα πρόσβασης ή εξαγωγής, ο Admin μπορεί να δημιουργήσει αναφορά από τα κύρια account, address, order, privacy και customer-visible support δεδομένα. Όταν η αναφορά ετοιμαστεί, εμφανίζονται ασφαλή links λήψης <strong>PDF</strong> και <strong>JSON</strong> μόνο μέσα στο authenticated account του ίδιου πελάτη.</p>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark">
        <div className="eyebrow light">Ποιος βλέπει τι</div>
        <h2>Η πρόσβαση ακολουθεί τον σκοπό.</h2>
        <div className="legal-card-grid">{DATA_ACCESS_EXAMPLES.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
      </div>
    </section>

    <section className="shell legal-section">
      <div className="eyebrow">Τι δεν σημαίνει «διαγραφή»</div>
      <h2>Δεν μπορούμε να σβήσουμε αρχεία που πρέπει νόμιμα να διατηρηθούν.</h2>
      <p>Μη απαραίτητα saved/recent/personalisation δεδομένα μπορούν να διαγραφούν ή να απενεργοποιηθούν. Όμως παραγγελίες, φορολογικά/λογιστικά στοιχεία, στοιχεία επιστροφών, ασφάλειας ή επίλυσης διαφοράς μπορεί να χρειάζεται να παραμείνουν για συγκεκριμένο νόμιμο σκοπό. Σε τέτοια περίπτωση το αίτημα μπορεί να ολοκληρωθεί με νόμιμη διατήρηση και σχετική εξήγηση.</p>
    </section>

    <section className="shell content-cta">
      <div><div className="eyebrow">Έτοιμος;</div><h2>Όλα τα επίσημα αιτήματα ξεκινούν από τον λογαριασμό σου.</h2><p>Έτσι γνωρίζουμε ότι το αίτημα ανήκει στον σωστό χρήστη και μπορείς να παρακολουθείς την πορεία του.</p></div>
      <div className="hero-actions"><Link className="button" href="/account/privacy">Privacy & Data Centre</Link><Link className="button button-secondary" href="/help">Χρειάζομαι βοήθεια</Link></div>
    </section>

    <SiteFooter />
  </main>;
}

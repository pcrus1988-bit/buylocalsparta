import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../../../lib/seo-metadata";
import styles from "../../../../components/ResearchSurveyPage.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/greek-retail-2026/methodology", {
    title: "Μεθοδολογία · Ελληνικό Λιανεμπόριο 2026",
    description: "Μεθοδολογική τεκμηρίωση, sampling, consent, weighting και reproducibility protocol της μελέτης Ελληνικό Λιανεμπόριο 2026.",
    keywords: ["μεθοδολογία Ελληνικό Λιανεμπόριο 2026", "δειγματοληψία λιανεμπορίου Ελλάδα", "στάθμιση ερευνητικού δείγματος", "research methodology Greece", "αναπαραγωγιμότητα έρευνας λιανεμπορίου", "probability sample Greek retail"]
  });
}

const stages = [
  ["1", "Population frame", "Παγωμένο snapshot του επιλέξιμου πληθυσμού επιχειρήσεων, με ακριβείς κανόνες ένταξης και hash περιεχομένου."],
  ["2", "Stratification", "Στρώματα βάσει γεωγραφίας, κλάδου και μεγέθους ώστε η επιλογή και η ανάλυση να είναι ελέγξιμες."],
  ["3", "Pilot holdout", "Το pilot έχει δικό του sample/invitations και timestamps. Κάθε επιχείρηση στην οποία στάλθηκε pilot πρόσκληση εξαιρείται οριστικά από το main sample, ακόμη και αν ανανεωθεί το frame."],
  ["4", "Main sample draw", "Μετά το κλείσιμο του pilot γίνεται νέο reproducible draw από τον main-eligible population. Αποθηκεύονται algorithm version, random seed, πιθανότητα ένταξης και base weight."],
  ["5", "Invitation", "Ο προσωπικός σύνδεσμος περιέχει τυχαίο token. Στη βάση αποθηκεύεται μόνο SHA-256 hash του token. Μετά την πρώτη πραγματική αποστολή το sample της φάσης δεν μπορεί να ξανακληρωθεί."],
  ["6", "Consent", "Η συγκατάθεση συμμετοχής είναι χωριστή από ενημέρωση αποτελεσμάτων, κωδικό ευχαριστίας και marketing."],
  ["7", "Instrument", "Το ερωτηματολόγιο έχει immutable version. Μετά το κλείδωμα δεν μπορούν να αλλάξουν οι ερωτήσεις του ίδιου version."],
  ["8", "Responses", "Η ολοκληρωμένη απάντηση κλειδώνει. Οι raw answers παραμένουν συνδεδεμένες με την ακριβή έκδοση του instrument."],
  ["9", "Pre-analysis plan", "Το greek-retail-2026-plan-v1 κλειδώνει primary/secondary analyses, weighting, variance και disclosure rules πριν από pilot/fieldwork."],
  ["10", "Weights", "Base weight, non-response adjustment και calibration adjustment έχουν ξεχωριστό version και αφορούν αποκλειστικά το main fieldwork."],
  ["11", "Analysis", "Κάθε analysis run συνδέεται με το immutable analysis-plan ID και αποθηκεύει code version, parameters, instrument version, weight version, fieldwork phase και dataset hash."],
  ["12", "Release", "Κάθε δημόσια έκδοση περιέχει pilot holdout disclosure, το analysis-plan version/hash, methodology snapshot, dataset hash και artifact hash."]
] as const;

export default function GreekRetailMethodologyPage() {
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RESEARCH METHODS</div>
      <span>Protocol · 2026 wave</span>
      <h1>Μεθοδολογία & αναπαραγωγιμότητα</h1>
      <p>Η αρχιτεκτονική της μελέτης έχει σχεδιαστεί ώστε ένα δημοσιευμένο εύρημα να μπορεί να ανακατασκευαστεί από το population frame μέχρι το τελικό report.</p>
      <div className={styles.meta}>
        <Link href="/research/greek-retail-2026">← Ελληνικό Λιανεμπόριο 2026</Link>
        <span>Instrument v0.2.0 · consent statement 2026-10-04-v1</span>
      </div>
    </header>

    <section className={styles.invalid}>
      <div className={styles.brand}>Research chain</div>
      {stages.map(([number, title, description]) => <article key={number} style={{ borderTop: "1px solid #d6cfbf", padding: "20px 0" }}>
        <strong>{number.padStart(2, "0")} · {title}</strong>
        <p>{description}</p>
      </article>)}
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Pilot isolation</div>
      <h2>Το pilot ελέγχει το instrument· δεν γίνεται μέρος του τελικού δείγματος.</h2>
      <p>Το pilot και το main fieldwork έχουν διαφορετικό fieldwork phase, διαφορετικά sample draws και διαφορετικά invitation ledgers. Με τη μετάβαση στο main fieldwork παγώνει το pilot exposure boundary: queued pilot send jobs ακυρώνονται, active sender αποτρέπει τη μετάβαση και οι ανοικτοί pilot σύνδεσμοι λήγουν.</p>
      <p>Η εξαίρεση γίνεται πάνω στο stable external business hash και όχι στο ID μιας γραμμής frame. Έτσι μια επιχείρηση που εκτέθηκε στο pilot δεν μπορεί να επανεισαχθεί επειδή δημιουργήθηκε νεότερο G.E.MI. snapshot. Το main sample draw επιτρέπεται μόνο αφού κλείσει αυτό το boundary.</p>
      <p>Το public release δημοσιεύει πόσες pilot-exposed μονάδες αφαιρέθηκαν από το τρέχον frozen frame και χρησιμοποιεί τον post-pilot πληθυσμό στους main contactability denominators.</p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Pre-fieldwork registration</div>
      <h2>Η ανάλυση δεν αποφασίζεται αφού δούμε τα αποτελέσματα.</h2>
      <p>
        Το <strong>greek-retail-2026-plan-v1</strong> κλειδώνεται πριν από pilot ή κανονικό fieldwork.
        Ορίζει ως primary outcomes τους δείκτες Digital Readiness και Retail Friction, ως pre-specified secondary
        analyses τις περιγραφικές αναλύσεις του κλειδωμένου instrument και ως exploratory τις pairwise συγκρίσεις
        περιοχής/κλάδου με Benjamini–Hochberg correction.
      </p>
      <p>
        Κάθε analysis run αποθηκεύει το analysis-plan ID/version/hash. Το release δημοσιεύει το ίδιο fingerprint,
        ώστε μια μεταγενέστερη exploratory ανάλυση να μην μπορεί να παρουσιαστεί σαν εκ των προτέρων υπόθεση.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Primary measures</div>
      <h2>Δύο βασικοί δείκτες, με σταθερό scoring version.</h2>
      <p><strong>Greek Retail Digital Readiness Score · 0–100.</strong> Βασίζεται σε πραγματικές δυνατότητες λειτουργίας, με κύριο βάρος στον οργανωμένο κατάλογο, απόθεμα, payments, orders, shipping, reporting και CRM, και συμπληρωματικά στο μερίδιο ψηφιακών πωλήσεων, τη συχνότητα ενημέρωσης και τα ψηφιακά κανάλια πώλησης.</p>
      <p><strong>Independent Retail Friction Index · 0–100.</strong> Μετατρέπει την κλίμακα δυσκολίας 1–5 σε 0–100 και δίνει τόσο συνολικό score όσο και επιμέρους dimensions για catalogue, growth και operations.</p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Privacy boundary</div>
      <h2>Η ταυτότητα του δείγματος και οι απαντήσεις δεν είναι το ίδιο dataset.</h2>
      <p>Τα στοιχεία επικοινωνίας αποθηκεύονται σε ξεχωριστό contact layer. Το token πρόσκλησης δεν αποθηκεύεται αυτούσιο και τα research tables δεν εκτίθενται απευθείας στο browser μέσω του Supabase Data API. Η δημόσια φόρμα μιλά μόνο με server-side research endpoints.</p>
      <p>Ο παραλήπτης μπορεί να αρνηθεί τη συγκεκριμένη συμμετοχή χωρίς να δημιουργηθεί research response και, ξεχωριστά, να ζητήσει να μη λάβει μελλοντική πρόσκληση για έρευνα του KONTA MOY. Η δεύτερη επιλογή αποθηκεύεται ως append-only suppression event πάνω σε hash του contact και ελέγχεται ξανά σε κάθε νέο population frame και πριν από κάθε αποστολή. Δεν αποτελεί ούτε δημιουργεί marketing consent.</p>
      <p>Η ύπαρξη διαθέσιμου δημόσιου email δεν θεωρείται μέρος της πιθανότητας επιλογής. Το release καταγράφει ξεχωριστά την email contactability συνολικά και ανά sampling stratum, ώστε η πιθανή μεροληψία από email-only fieldwork να είναι ορατή και να μην κρύβεται μέσα στο response rate.</p>
      <p>Το προαιρετικό πείραμα πλατφόρμας είναι χωριστό από το βασικό survey. Τα υποθετικά profiles δημιουργούνται deterministically ανά response ώστε να μπορούν να αναπαραχθούν αργότερα χωρίς να αποτελούν πραγματική εμπορική προσφορά.</p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Publication rule</div>
      <h2>Δεν δημοσιεύεται αριθμός χωρίς provenance.</h2>
      <p>Η δημόσια έκδοση θα αναφέρει target population, frame date, field dates, sampling method, invitations, starts, completes, exclusions, weighting method, unweighted/weighted bases και limitations. Αν η τελική συλλογή δεν πληροί τις προϋποθέσεις πιθανoκρατικής δειγματοληψίας, δεν θα παρουσιάζεται συμβατικό margin of error ως εάν επρόκειτο για probability sample.</p>
    </section>
    <SiteFooter />
  </main>;
}

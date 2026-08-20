import type { Metadata } from "next";
import { VendorApplicationForm } from "../../../components/VendorApplicationForm";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { vendorApplicationReadiness, type VendorApplicationInput } from "../../../lib/vendor-application-runtime";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Αίτηση συνεργασίας εμπόρου",
  description: "Σύγκρινε πρόγραμμα και υπόβαλε ελεγχόμενη αίτηση συνεργασίας για το ΚΟΝΤΑ ΜΟΥ Sparta. Η αίτηση περνά από verification, catalog onboarding και test readiness πριν από οποιαδήποτε ενεργοποίηση.",
  robots: { index: false, follow: true }
};

const planOptions = [
  { code: "founding_2026", name: "Founding Partner", setup: "€1.500 εφάπαξ", recurring: "€0 συνδρομή", commission: "2% προμήθεια", note: "36 μήνες προστατευμένου Founding Partner καθεστώτος · έως 50 συνεργάτες." },
  { code: "annual", name: "Annual", setup: "€299 εφάπαξ", recurring: "€399 / έτος", commission: "5% προμήθεια", note: "Η καλύτερη ισορροπία χαμηλού αρχικού κόστους και χαμηλότερης προμήθειας." },
  { code: "monthly", name: "Monthly", setup: "€499 εφάπαξ", recurring: "€49 / μήνα", commission: "7% προμήθεια", note: "Μηνιαία συνεργασία για μεγαλύτερη ευελιξία χωρίς ετήσιο κύκλο." }
] as const;

export default async function VendorApplicationPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const principal = await getAccountSession();
  const readiness = vendorApplicationReadiness();
  const params = await searchParams;
  const initialPlanCode = normalizePlan(params.plan);

  return <main>
    <div className="announcement">Vendor onboarding · αίτηση → επαλήθευση → catalog onboarding → test readiness → ενεργοποίηση.</div>
    <SiteHeader compact />
    <section className="shell section">
      <div className="section-heading"><div><div className="eyebrow">Vendor application</div><h1>Ξεκίνα την αίτηση συνεργασίας.</h1></div><p>Διάλεξε ή άλλαξε πρόγραμμα πριν συμπληρώσεις την αίτηση. Η επιλογή αποθηκεύεται μαζί με το application record αλλά δεν δημιουργεί χρέωση ή αυτόματη σύμβαση.</p></div>

      <div className="shops-principles" aria-label="Vendor application steps"><div><strong>1 · Submit</strong><span>Καταχωρίζονται τα βασικά στοιχεία της επιχείρησης και η αίτηση περνά σε verification pending.</span></div><div><strong>2 · Verify & onboard</strong><span>Η ομάδα ελέγχει επιχείρηση, contact ownership, κατάλογο, stock και readiness.</span></div><div><strong>3 · Admin activation</strong><span>Vendor business, location και vendor-owner access δημιουργούνται μόνο μετά την τελική ελεγχόμενη ενεργοποίηση.</span></div></div>

      <div className={styles.applyPlanSelector} id="plan-choice">
        <div className={styles.applyPlanSelectorHeader}><div><div className="eyebrow">Επιλογή προγράμματος</div><h2>Σύγκρινε και διάλεξε πριν υποβάλεις.</h2></div><p>Μπορείς να αλλάξεις επιλογή εδώ ή ξανά μέσα στη φόρμα. Οι τιμές είναι προ ΦΠΑ όπου εφαρμόζεται και επιβεβαιώνονται στους τελικούς εμπορικούς όρους.</p></div>
        <div className={styles.applyPlanGrid}>{planOptions.map((plan) => {
          const selected = plan.code === initialPlanCode;
          return <a key={plan.code} className={`${styles.applyPlanCard} ${selected ? styles.applyPlanCardSelected : ""}`} href={`/join/apply?plan=${plan.code}#plan-choice`} aria-current={selected ? "true" : undefined}><strong>{plan.name}</strong><span>{plan.setup}</span><span>{plan.recurring}</span><span>{plan.commission}</span><small>{plan.note}</small>{selected && <span className={styles.selectedLabel}>Επιλεγμένο στην αίτηση</span>}</a>;
        })}</div>
        <p className={styles.planFootnote}>Θέλεις περισσότερη ανάλυση; <a className="text-link" href="/join#plans">Επιστροφή στην πλήρη σύγκριση προγραμμάτων →</a></p>
      </div>

      <div className="login-layout vendor-apply-layout">
        <div className="login-copy"><div className="eyebrow">Πριν υποβάλεις</div><h2>Έχε διαθέσιμα τα πραγματικά στοιχεία της επιχείρησης.</h2><p>Θα χρειαστούμε νομική και εμπορική ονομασία, ΑΦΜ, στοιχεία φυσικού καταστήματος, υπεύθυνο επικοινωνίας και βασική εικόνα του καταλόγου/stock.</p><div className="fairness-note"><strong>Δεν χρειάζεται να έχεις τέλειο e-shop.</strong><p>Ο στόχος είναι να φέρουμε το κατάστημά σου στο κοινό marketplace. Στο onboarding μπορούμε να βοηθήσουμε με catalog mapping, product data, stock process και παρουσίαση της επιχείρησης.</p></div><a className="text-link" href="/join/requirements">Ξαναδές το readiness checklist →</a><a className="text-link" href="/fairness">Πώς προστατεύεται η ισότιμη ανάθεση →</a>{principal && <div className="account-gate"><strong>Συνδεδεμένος λογαριασμός</strong><p>{principal.email}</p><p>Η αίτηση θα συνδεθεί με αυτή την επαληθευμένη ταυτότητα, ανεξάρτητα από το business contact email.</p></div>}</div>
        <div className="login-panel vendor-apply-panel">{!readiness.ready ? <div className="account-gate"><strong>Η αίτηση δεν είναι διαθέσιμη.</strong><p>{readiness.message}</p></div> : <VendorApplicationForm csrfToken={principal?.csrfToken} signedInEmail={principal?.email} initialPlanCode={initialPlanCode} />}</div>
      </div>
    </section>
    <SiteFooter />
  </main>;
}

function normalizePlan(value: string | undefined): VendorApplicationInput["requestedPlanCode"] {
  if (value === "founding_2026" || value === "monthly") return value;
  return "annual";
}

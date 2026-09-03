import type { Metadata } from "next";
import { VendorApplicationForm } from "../../../components/VendorApplicationForm";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { vendorApplicationReadiness, type VendorApplicationInput } from "../../../lib/vendor-application-runtime";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Αίτηση συνεργασίας εμπόρου",
  description: "Ξεκίνα με το ΑΦΜ, ανάκτησε διαθέσιμα στοιχεία επιχείρησης από το Γ.Ε.ΜΗ. και υπόβαλε ελεγχόμενη αίτηση συνεργασίας για το ΚΟΝΤΑ ΜΟΥ Sparta.",
  robots: { index: false, follow: true }
};

const planOptions = [
  { code: "founding_2026", name: "Founding Partner", setup: "€1.500 εφάπαξ", recurring: "€0 συνδρομή", commission: "2% προμήθεια", note: "36 μήνες προστατευμένου Founding Partner καθεστώτος · έως 50 συνεργάτες." },
  { code: "annual", name: "Annual", setup: "€299 εφάπαξ", recurring: "€399 / έτος", commission: "5% προμήθεια", note: "Η καλύτερη ισορροπία χαμηλού αρχικού κόστους και χαμηλότερης προμήθειας." },
  { code: "monthly", name: "Monthly", setup: "€499 εφάπαξ", recurring: "€49 / μήνα", commission: "7% προμήθεια", note: "Μηνιαία συνεργασία για μεγαλύτερη ευελιξία χωρίς ετήσιο κύκλο." }
] as const;

type SearchParams = Promise<{
  plan?: string | string[];
  claim?: string | string[];
}>;

export default async function VendorApplicationPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getAccountSession();
  const readiness = vendorApplicationReadiness();
  const params = await searchParams;
  const initialPlanCode = normalizePlan(first(params.plan));
  const requestedClaim = first(params.claim);
  const claimCandidate = requestedClaim ? await getPublicVendorDirectoryEntry(requestedClaim) : undefined;
  const claimTarget = claimCandidate?.directoryStatus === "research" ? claimCandidate : undefined;
  const claimQuery = claimTarget ? `&claim=${encodeURIComponent(claimTarget.id)}` : "";

  return <main>
    <div className="announcement">Partner onboarding · ΑΦΜ → Γ.Ε.ΜΗ. → verification εκπροσώπησης/επικοινωνίας → catalog onboarding → ενεργοποίηση.</div>
    <SiteHeader compact />
    <section className="shell section">
      <div className="section-heading"><div><div className="eyebrow">Vendor application</div><h1>Ξεκίνα την αίτηση με το ΑΦΜ σου.</h1></div><p>Το ΚΟΝΤΑ ΜΟΥ ανακτά πρώτα τα διαθέσιμα δημοσιευμένα στοιχεία της επιχείρησης από το Γ.Ε.ΜΗ. και ζητά μόνο όσα λείπουν ή αφορούν ειδικά το marketplace.</p></div>

      {claimTarget && <div className="fairness-note">
        <strong>Διεκδικείτε την υπάρχουσα σελίδα της {claimTarget.name}.</strong>
        <p>Η αίτηση θα συνδεθεί με το προφίλ <code>/vendor/{claimTarget.id}</code>. Το ΑΦΜ/Γ.Ε.ΜΗ. λειτουργεί ως πρόσθετο identity evidence. Η σελίδα παραμένει δημόσια στην ίδια διεύθυνση κατά τον έλεγχο και, μετά από επιτυχή επαλήθευση/ενεργοποίηση, η ίδια ταυτότητα μετατρέπεται σε ενεργό partner profile αντί να δημιουργηθεί δεύτερη σελίδα.</p>
      </div>}

      {requestedClaim && !claimTarget && <div className="account-gate">
        <strong>Η συγκεκριμένη σελίδα δεν είναι διαθέσιμη για νέα διεκδίκηση.</strong>
        <p>Μπορείτε να συνεχίσετε με νέα αίτηση συνεργασίας χωρίς σύνδεση σε research profile ή να επικοινωνήσετε μαζί μας για ασφαλή ταυτοποίηση υπάρχουσας συνεργασίας.</p>
      </div>}

      <div className="shops-principles" aria-label="Vendor application steps"><div><strong>1 · ΑΦΜ & Γ.Ε.ΜΗ.</strong><span>Ελέγχουμε το ΑΦΜ και συμπληρώνουμε τη νομική ταυτότητα από τα διαθέσιμα Γ.Ε.ΜΗ. OpenData.</span></div><div><strong>2 · Verify owner & contacts</strong><span>Συμπληρώνεις μόνο όσα λείπουν/διαφέρουν και η ομάδα ελέγχει εκπροσώπηση, email/τηλέφωνο και επιλεξιμότητα.</span></div><div><strong>3 · Onboard & activate</strong><span>{claimTarget ? "Το υπάρχον indexed vendor profile ενεργοποιείται χωρίς αλλαγή URL μόνο μετά τα gates." : "Catalog onboarding, test readiness και vendor access ακολουθούν μόνο μετά την ελεγχόμενη επαλήθευση."}</span></div></div>

      <div className={styles.applyPlanSelector} id="plan-choice">
        <div className={styles.applyPlanSelectorHeader}><div><div className="eyebrow">Επιλογή προγράμματος</div><h2>Σύγκρινε και διάλεξε πριν υποβάλεις.</h2></div><p>Μπορείς να αλλάξεις επιλογή εδώ ή ξανά μέσα στη φόρμα. Οι τιμές είναι προ ΦΠΑ όπου εφαρμόζεται και επιβεβαιώνονται στους τελικούς εμπορικούς όρους.</p></div>
        <div className={styles.applyPlanGrid}>{planOptions.map((plan) => {
          const selected = plan.code === initialPlanCode;
          return <a key={plan.code} className={`${styles.applyPlanCard} ${selected ? styles.applyPlanCardSelected : ""}`} href={`/join/apply?plan=${plan.code}${claimQuery}#plan-choice`} aria-current={selected ? "true" : undefined}><strong>{plan.name}</strong><span>{plan.setup}</span><span>{plan.recurring}</span><span>{plan.commission}</span><small>{plan.note}</small>{selected && <span className={styles.selectedLabel}>Επιλεγμένο στην αίτηση</span>}</a>;
        })}</div>
        <p className={styles.planFootnote}>Θέλεις περισσότερη ανάλυση; <a className="text-link" href="/join#plans">Επιστροφή στην πλήρη σύγκριση προγραμμάτων →</a></p>
      </div>

      <div className="login-layout vendor-apply-layout">
        <div className="login-copy"><div className="eyebrow">Πριν υποβάλεις</div><h2>Έχε πρόχειρο το ΑΦΜ της επιχείρησης.</h2><p>Ξεκινάμε μόνο από το ΑΦΜ. Αν το Γ.Ε.ΜΗ. διαθέτει επωνυμία, διακριτικό τίτλο, αριθμό Γ.Ε.ΜΗ., έδρα ή email, τα συμπληρώνουμε αυτόματα. Θα σου ζητήσουμε χειροκίνητα μόνο τα στοιχεία που λείπουν ή αφορούν το πραγματικό κατάστημα/την επικοινωνία με το ΚΟΝΤΑ ΜΟΥ.</p><div className="fairness-note"><strong>Το Γ.Ε.ΜΗ. δεν αντικαθιστά την επαλήθευση εκπροσώπησης.</strong><p>Η εύρεση μιας επιχείρησης από το ΑΦΜ επιβεβαιώνει τη νομική ταυτότητα. Δεν δίνει αυτόματα vendor access και δεν αποδεικνύει από μόνη της ότι ο αιτών είναι εξουσιοδοτημένος εκπρόσωπος.</p></div><a className="text-link" href="/join/requirements">Ξαναδές το readiness checklist →</a><a className="text-link" href="/fairness">Πώς προστατεύεται η ισότιμη ανάθεση →</a>{principal && <div className="account-gate"><strong>Συνδεδεμένος λογαριασμός</strong><p>{principal.email}</p><p>Η αίτηση θα συνδεθεί με αυτή την επαληθευμένη ταυτότητα, ανεξάρτητα από το business contact email.</p></div>}</div>
        <div className="login-panel vendor-apply-panel">{!readiness.ready ? <div className="account-gate"><strong>Η αίτηση δεν είναι διαθέσιμη.</strong><p>{readiness.message}</p></div> : <VendorApplicationForm csrfToken={principal?.csrfToken} signedInEmail={principal?.email} initialPlanCode={initialPlanCode} claimedResearchVendorId={claimTarget?.id} claimTargetName={claimTarget?.name} />}</div>
      </div>
    </section>
    <SiteFooter />
  </main>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePlan(value: string | undefined): VendorApplicationInput["requestedPlanCode"] {
  if (value === "founding_2026" || value === "monthly") return value;
  return "annual";
}

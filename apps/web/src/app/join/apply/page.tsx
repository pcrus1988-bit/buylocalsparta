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
  { code: "founding_2026", name: "Founding Partner", summary: "€1.500 εφάπαξ · €0 συνδρομή · 2% προμήθεια" },
  { code: "annual", name: "Annual", summary: "€299 εφάπαξ · €399 / έτος · 5% προμήθεια" },
  { code: "monthly", name: "Monthly", summary: "€499 εφάπαξ · €49 / μήνα · 7% προμήθεια" }
] as const;

type SearchParams = Promise<{
  plan?: string | string[];
  claim?: string | string[];
  plans?: string | string[];
}>;

export default async function VendorApplicationPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getAccountSession();
  const readiness = vendorApplicationReadiness();
  const params = await searchParams;
  const initialPlanCode = normalizePlan(first(params.plan));
  const showPlanChoices = first(params.plans) === "1";
  const selectedPlan = planOptions.find((plan) => plan.code === initialPlanCode) ?? planOptions[1];
  const requestedClaim = first(params.claim);
  const claimCandidate = requestedClaim ? await getPublicVendorDirectoryEntry(requestedClaim) : undefined;
  const claimTarget = claimCandidate?.directoryStatus === "research" ? claimCandidate : undefined;
  const claimQuery = claimTarget ? `&claim=${encodeURIComponent(claimTarget.id)}` : "";

  return <main>
    <SiteHeader compact />
    <section className={`shell section ${styles.applyShell}`}>
      <div className={styles.applyPlanSelector} id="plan-choice" aria-label="Επιλογή προγράμματος συνεργασίας">
        {!showPlanChoices ? <div className={styles.applyPlanSummary}>
          <div className={styles.applyPlanSummaryText}>
            <span>Πρόγραμμα συνεργασίας</span>
            <strong>{selectedPlan.name}</strong>
            <small>{selectedPlan.summary}</small>
          </div>
          <a className={styles.applyPlanChange} href={`/join/apply?plan=${selectedPlan.code}${claimQuery}&plans=1#plan-choice`}>Αλλαγή</a>
        </div> : <>
          <div className={styles.applyPlanCompactHeader}>
            <strong>Διάλεξε πρόγραμμα</strong>
            <a className={styles.applyPlanChange} href={`/join/apply?plan=${selectedPlan.code}${claimQuery}#application-form`}>Κλείσιμο</a>
          </div>
          <div className={styles.applyPlanGrid}>{planOptions.map((plan) => {
            const selected = plan.code === initialPlanCode;
            return <a
              key={plan.code}
              className={`${styles.applyPlanCard} ${selected ? styles.applyPlanCardSelected : ""}`}
              href={`/join/apply?plan=${plan.code}${claimQuery}#application-form`}
              aria-current={selected ? "true" : undefined}
            >
              <strong>{plan.name}</strong>
              <span>{plan.summary}</span>
              {selected && <small className={styles.selectedLabel}>Τρέχουσα επιλογή</small>}
            </a>;
          })}</div>
          <a className={styles.applyPlanCompareLink} href="/join#plans">Πλήρης σύγκριση προγραμμάτων →</a>
        </>}
      </div>

      {requestedClaim && !claimTarget && <div className="account-gate">
        <strong>Η συγκεκριμένη σελίδα δεν είναι διαθέσιμη για νέα διεκδίκηση.</strong>
        <p>Μπορείς να συνεχίσεις με νέα αίτηση συνεργασίας χωρίς σύνδεση σε research profile ή να επικοινωνήσεις μαζί μας για ασφαλή ταυτοποίηση υπάρχουσας συνεργασίας.</p>
      </div>}

      <div id="application-form" className={styles.applyFormPanel}>
        {!readiness.ready ? <div className="account-gate"><strong>Η αίτηση δεν είναι διαθέσιμη.</strong><p>{readiness.message}</p></div> : <VendorApplicationForm csrfToken={principal?.csrfToken} signedInEmail={principal?.email} initialPlanCode={initialPlanCode} claimedResearchVendorId={claimTarget?.id} claimTargetName={claimTarget?.name} />}
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

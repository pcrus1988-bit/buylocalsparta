import type { Metadata } from "next";
import { HubExpansionApplicationForm } from "../../../../components/HubExpansionApplicationForm";
import { SiteFooter } from "../../../../components/SiteFooter";
import { SiteHeader } from "../../../../components/SiteHeader";
import {
  HUB_EXPANSION_PLANS,
  billingLabelForPlan,
  normalizeHubBillingCycle,
  normalizeHubExpansionPlanCode,
  type HubBillingCycle
} from "../../../../lib/hub-expansion-plans";
import { hubProspectApplicationReadiness } from "../../../../lib/hub-prospect-application-runtime";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Αίτηση για νέο HUB · ΚΟΝΤΑ ΜΟΥ",
  description: "Ξεκίνα με το ΑΦΜ, ανάκτησε τα στοιχεία Γ.Ε.ΜΗ. και άφησε το ΚΟΝΤΑ ΜΟΥ να αντιστοιχίσει αυτόματα την επιχείρησή σου στο σωστό HUB.",
  robots: { index: false, follow: true }
};

type SearchParams = Promise<{
  plan?: string | string[];
  billing?: string | string[];
  plans?: string | string[];
}>;

export default async function HubExpansionApplyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const planCode = normalizeHubExpansionPlanCode(first(params.plan));
  const selectedPlan = HUB_EXPANSION_PLANS.find((plan) => plan.code === planCode) ?? HUB_EXPANSION_PLANS[0];
  const requestedBillingCycle = normalizeHubBillingCycle(first(params.billing));
  const billingCycle: HubBillingCycle = selectedPlan.code === "claim" ? "annual" : requestedBillingCycle;
  const billingLabel = billingLabelForPlan(selectedPlan, billingCycle);
  const showPlanChoices = first(params.plans) === "1";
  const readiness = hubProspectApplicationReadiness();

  return <main>
    <SiteHeader compact />
    <section className={`shell section ${styles.shell}`}>
      <a className={styles.back} href="/hubs/join">← Προγράμματα επέκτασης</a>
      <div className={styles.heading}>
        <div><div className="eyebrow">HUB expansion · AFM first</div><h1>Ξεκίνα με το ΑΦΜ σου.</h1></div>
        <p>Όπως και στο ενεργό onboarding της Σπάρτης, πρώτα επαληθεύουμε την επιχείρηση στο Γ.Ε.ΜΗ. Το HUB προκύπτει αυτόματα από την επαληθευμένη τοποθεσία — δεν το επιλέγει ο vendor.</p>
      </div>

      <div className={styles.planSelector} id="plan-choice">
        {!showPlanChoices ? <div className={styles.planSummary}>
          <div>
            <span>Πρόγραμμα ενδιαφέροντος</span>
            <strong>{selectedPlan.name}</strong>
            <small>{selectedPlan.setupLabel} ένταξη · {billingLabel} · {selectedPlan.commissionLabel} προμήθεια</small>
          </div>
          <a href={`/hubs/join/apply?plan=${selectedPlan.code}&billing=${billingCycle}&plans=1#plan-choice`}>Αλλαγή</a>
        </div> : <>
          <div className={styles.planChoiceHeader}><strong>Διάλεξε πρόγραμμα</strong><a href={`/hubs/join/apply?plan=${selectedPlan.code}&billing=${billingCycle}#application-form`}>Κλείσιμο</a></div>
          <div className={styles.planGrid}>{HUB_EXPANSION_PLANS.map((plan) => {
            const targetBilling = plan.code === "claim" ? "annual" : billingCycle;
            return <a
              href={`/hubs/join/apply?plan=${plan.code}&billing=${targetBilling}#application-form`}
              className={`${styles.planOption} ${plan.code === selectedPlan.code ? styles.selected : ""}`}
              aria-current={plan.code === selectedPlan.code ? "true" : undefined}
              key={plan.code}
            ><strong>{plan.name}</strong><span>{plan.setupLabel} · {billingLabelForPlan(plan, targetBilling)} · {plan.commissionLabel}</span>{plan.code === selectedPlan.code && <small>Τρέχουσα επιλογή</small>}</a>;
          })}</div>
          <a className={styles.compare} href="/hubs/join#plans">Σύγκριση με checkmarks →</a>
        </>}
      </div>

      {selectedPlan.code !== "claim" && <div className={styles.planSelector} id="billing-choice">
        <div className={styles.planChoiceHeader}>
          <strong>Χρέωση συνδρομής</strong>
          <span>Η επιλογή αποθηκεύεται με την αίτηση</span>
        </div>
        <div className={styles.billingGrid}>
          <a
            href={`/hubs/join/apply?plan=${selectedPlan.code}&billing=annual#billing-choice`}
            className={`${styles.planOption} ${billingCycle === "annual" ? styles.selected : ""}`}
            aria-current={billingCycle === "annual" ? "true" : undefined}
          ><strong>Ετήσια</strong><span>{selectedPlan.annualLabel} · περίπου 2 μήνες χωρίς συνδρομή</span>{billingCycle === "annual" && <small>Τρέχουσα επιλογή</small>}</a>
          <a
            href={`/hubs/join/apply?plan=${selectedPlan.code}&billing=monthly#billing-choice`}
            className={`${styles.planOption} ${billingCycle === "monthly" ? styles.selected : ""}`}
            aria-current={billingCycle === "monthly" ? "true" : undefined}
          ><strong>Μηνιαία</strong><span>{selectedPlan.monthlyLabel} · μεγαλύτερη ευελιξία</span>{billingCycle === "monthly" && <small>Τρέχουσα επιλογή</small>}</a>
        </div>
      </div>}

      <div className={styles.contextStrip}>
        <div><span>Ταυτοποίηση</span><strong>ΑΦΜ → Γ.Ε.ΜΗ.</strong></div>
        <div><span>HUB</span><strong>Αυτόματα από επαληθευμένη τοποθεσία / Τ.Κ.</strong></div>
        <div><span>Χρέωση</span><strong>{selectedPlan.code === "claim" ? "Δωρεάν" : billingCycle === "annual" ? "Ετήσια" : "Μηνιαία"}</strong></div>
        <div><span>Πληρωμή τώρα</span><strong>Όχι</strong></div>
      </div>

      <div id="application-form" className={styles.formPanel}>
        {!readiness.ready
          ? <div className={styles.unavailable}><strong>Η αίτηση δεν είναι διαθέσιμη σε αυτό το περιβάλλον.</strong><p>{readiness.message}</p></div>
          : <HubExpansionApplicationForm planCode={selectedPlan.code} billingCycle={billingCycle} />}
      </div>
    </section>
    <SiteFooter />
  </main>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HubExpansionApplicationForm } from "../../../../components/HubExpansionApplicationForm";
import { SiteFooter } from "../../../../components/SiteFooter";
import { SiteHeader } from "../../../../components/SiteHeader";
import { EXPANSION_HUBS, getExpansionHubBySlug } from "../../../../lib/expansion-hubs";
import { HUB_EXPANSION_PLANS, normalizeHubExpansionPlanCode } from "../../../../lib/hub-expansion-plans";
import { hubProspectApplicationReadiness } from "../../../../lib/hub-prospect-application-runtime";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Αίτηση για νέο HUB · ΚΟΝΤΑ ΜΟΥ",
  description: "Δήλωσε την επιχείρησή σου ως prospect για ένα νέο τοπικό HUB του ΚΟΝΤΑ ΜΟΥ.",
  robots: { index: false, follow: true }
};

type SearchParams = Promise<{
  plan?: string | string[];
  hub?: string | string[];
  plans?: string | string[];
}>;

const hubs = EXPANSION_HUBS
  .filter((hub) => !hub.isSpartaLegacy)
  .slice()
  .sort((a, b) => a.nameEl.localeCompare(b.nameEl, "el"));

export default async function HubExpansionApplyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const planCode = normalizeHubExpansionPlanCode(first(params.plan));
  const selectedPlan = HUB_EXPANSION_PLANS.find((plan) => plan.code === planCode) ?? HUB_EXPANSION_PLANS[0];
  const requestedHubSlug = first(params.hub);
  const requestedHub = requestedHubSlug ? getExpansionHubBySlug(requestedHubSlug) : undefined;
  if (requestedHub?.isSpartaLegacy) redirect("/join");
  const initialHub = requestedHub && !requestedHub.isSpartaLegacy ? requestedHub : undefined;
  const showPlanChoices = first(params.plans) === "1";
  const hubQuery = initialHub ? `&hub=${encodeURIComponent(initialHub.slug)}` : "";
  const readiness = hubProspectApplicationReadiness();

  return <main>
    <SiteHeader compact />
    <section className={`shell section ${styles.shell}`}>
      <a className={styles.back} href="/hubs/join">← Προγράμματα & HUB επέκτασης</a>
      <div className={styles.heading}>
        <div><div className="eyebrow">HUB expansion prospect</div><h1>Δήλωσε την επιχείρησή σου.</h1></div>
        <p>Η αίτηση καταχωρίζεται για το επιλεγμένο HUB ως prospect. Δεν επηρεάζει τη Σπάρτη, δεν ενεργοποιεί αυτόματα e-shop και δεν δημιουργεί χρέωση.</p>
      </div>

      {requestedHubSlug && !requestedHub && <div className={styles.notice}><strong>Δεν αναγνωρίστηκε το HUB που ζητήθηκε.</strong><span>Επίλεξε μία από τις διαθέσιμες περιοχές μέσα στην αίτηση.</span></div>}

      <div className={styles.planSelector} id="plan-choice">
        {!showPlanChoices ? <div className={styles.planSummary}>
          <div><span>Πρόγραμμα ενδιαφέροντος</span><strong>{selectedPlan.name}</strong><small>{selectedPlan.setupLabel} ένταξη · {selectedPlan.recurringLabel} · {selectedPlan.commissionLabel} προμήθεια</small></div>
          <a href={`/hubs/join/apply?plan=${selectedPlan.code}${hubQuery}&plans=1#plan-choice`}>Αλλαγή</a>
        </div> : <>
          <div className={styles.planChoiceHeader}><strong>Διάλεξε πρόγραμμα</strong><a href={`/hubs/join/apply?plan=${selectedPlan.code}${hubQuery}#application-form`}>Κλείσιμο</a></div>
          <div className={styles.planGrid}>{HUB_EXPANSION_PLANS.map((plan) => <a
            href={`/hubs/join/apply?plan=${plan.code}${hubQuery}#application-form`}
            className={`${styles.planOption} ${plan.code === selectedPlan.code ? styles.selected : ""}`}
            aria-current={plan.code === selectedPlan.code ? "true" : undefined}
            key={plan.code}
          ><strong>{plan.name}</strong><span>{plan.setupLabel} · {plan.recurringLabel} · {plan.commissionLabel}</span>{plan.code === selectedPlan.code && <small>Τρέχουσα επιλογή</small>}</a>)}</div>
          <a className={styles.compare} href="/hubs/join#plans">Πλήρης σύγκριση προγραμμάτων →</a>
        </>}
      </div>

      <div className={styles.contextStrip}>
        <div><span>HUB</span><strong>{initialHub ? `${initialHub.nameEl} · ${initialHub.regionEl}` : "Θα επιλεγεί στην αίτηση"}</strong></div>
        <div><span>Κατάσταση</span><strong>Prospect / pending verification</strong></div>
        <div><span>Πληρωμή τώρα</span><strong>Όχι</strong></div>
      </div>

      <div id="application-form" className={styles.formPanel}>
        {!readiness.ready
          ? <div className={styles.unavailable}><strong>Η αίτηση δεν είναι διαθέσιμη σε αυτό το περιβάλλον.</strong><p>{readiness.message}</p></div>
          : <HubExpansionApplicationForm hubs={hubs} initialHubSlug={initialHub?.slug} planCode={selectedPlan.code} />}
      </div>
    </section>
    <SiteFooter />
  </main>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
